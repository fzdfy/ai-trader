import { and, eq, gte, isNull } from "drizzle-orm";
import { mastra } from "../agent/mastra";
import {
  FACTOR_GENERATION_FAILURE,
  validateFactorExpression,
} from "../agent/mastra/agents/factor-generator";
import { db } from "../db";
import { factorIteration, jobRun } from "../db/schema";
import {
  isFactorGoodEnough,
  renderFactorFeedback,
  renderInvalidFeedback,
  summarizeFactorEvaluation,
  type FactorEvaluationSummary,
} from "../lib/factor-feedback";
import { createLogger } from "../lib/logger";
import { quant } from "../lib/quant";
import { runWithLogContext } from "../lib/request-context";
import { getSyncTradeDate } from "../workers/sync-worker/calendar";
import { STALE_RUN_MS } from "../workers/sync-worker/runner";
import { WorkflowActionError } from "./workflow-action-utils.ts";

export const ITERATE_JOB_TYPE = "factor-iterate";
const DEFAULT_ROUNDS = 3;
const MAX_ROUNDS = 5;
const MAX_CONSECUTIVE_FAILURES = 2;
const DEFAULT_VALID_RATIO = 0.3;
const DEFAULT_BARS = 250;
const DEFAULT_MAX_SYMBOLS = 300;
const DECAY_HORIZONS = [1, 2, 3, 5, 10, 20];

const iterateLog = createLogger("factor-iterate");

function toPositiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function toValidRatio(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(value, 0.45);
}

function toAsOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : undefined;
}

interface IterateParams {
  description: string;
  maxRounds: number;
  horizon?: number;
  layers?: number;
  bars: number;
  maxSymbols: number;
  minSymbols?: number;
  validRatio: number;
  asOf?: string;
}

interface IterateRound {
  round: number;
  expression: string | null;
  summary?: FactorEvaluationSummary;
  error?: string;
  note?: string;
}

function formatMetric(value: number | null | undefined, digits = 4): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function buildIterationValues(
  runId: number,
  record: IterateRound,
): typeof factorIteration.$inferInsert {
  const summary = record.summary;
  let status: string;
  if (summary) status = "evaluated";
  else if (record.note) status = "stopped";
  else if (record.error?.startsWith("生成失败") || record.error?.startsWith("因子检验失败")) {
    status = "failed";
  } else {
    status = "invalid";
  }

  return {
    runId,
    round: record.round,
    status,
    expression: record.expression,
    icMean: summary?.icMean ?? null,
    rankIcMean: summary?.rankIcMean ?? null,
    icir: summary?.icir ?? null,
    tStat: summary?.tStat ?? null,
    positiveRatio: summary?.positiveRatio ?? null,
    longShortAnnRet: summary?.longShortAnnRet ?? null,
    longShortCumRet: summary?.longShortCumRet ?? null,
    monotonicity: summary?.monotonicity ?? null,
    retention: summary?.retention ?? null,
    score: summary?.score ?? null,
    sampleCount: summary?.sampleCount ?? null,
    symbols: summary?.symbols ?? null,
    validRatio: summary?.validRatio ?? null,
    splitDate: summary?.splitDate ?? null,
    validIcMean: summary?.validIcMean ?? null,
    validRankIcMean: summary?.validRankIcMean ?? null,
    validIcir: summary?.validIcir ?? null,
    validLongShortAnnRet: summary?.validLongShortAnnRet ?? null,
    validLongShortCumRet: summary?.validLongShortCumRet ?? null,
    validSampleCount: summary?.validSampleCount ?? null,
    message: summary ? null : (record.error ?? record.note ?? null),
  };
}

async function saveIterationRound(runId: number, record: IterateRound): Promise<void> {
  try {
    await db.insert(factorIteration).values(buildIterationValues(runId, record));
  } catch (error) {
    iterateLog.warn({ err: error, job_run_id: runId, round: record.round }, "迭代轨迹落库失败");
  }
}

async function markProgress(
  runId: number,
  round: number,
  total: number,
  best: IterateRound | null,
  note: string,
): Promise<void> {
  const bestPart = best?.summary
    ? `，当前最佳 IC=${formatMetric(best.summary.icMean)} ICIR=${formatMetric(best.summary.icir, 3)}`
    : "";
  await db
    .update(jobRun)
    .set({ processed: round, message: `${note}（${round}/${total}）${bestPart}` })
    .where(eq(jobRun.id, runId))
    .catch(() => undefined);
}

async function executeFactorIteration(runId: number, params: IterateParams): Promise<void> {
  const context = {
    requestId: crypto.randomUUID(),
    source: "manual" as const,
    jobName: ITERATE_JOB_TYPE,
    jobRunId: String(runId),
  };

  await runWithLogContext(context, async () => {
    const agent = mastra.getAgent("factorGenerator");
    const trajectory: IterateRound[] = [];
    const seen = new Set<string>();
    let feedback = "";
    let best: IterateRound | null = null;
    let consecutiveFailures = 0;

    for (let round = 1; round <= params.maxRounds; round += 1) {
      const input = round === 1 ? params.description : `${params.description}\n\n${feedback}`;

      let expression: string;
      try {
        expression = (await agent.generate(input)).text.trim();
      } catch (error) {
        consecutiveFailures += 1;
        const message = (error as Error)?.message ?? String(error);
        const record: IterateRound = {
          round,
          expression: null,
          error: `生成失败：${message}`,
        };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        feedback = renderInvalidFeedback("（生成异常）", message, round);
        await markProgress(runId, round, params.maxRounds, best, `第 ${round} 轮生成失败`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }

      if (!expression || expression === FACTOR_GENERATION_FAILURE) {
        const record: IterateRound = {
          round,
          expression: null,
          note: "模型判定无法生成",
        };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        break;
      }

      if (seen.has(expression)) {
        const record: IterateRound = {
          round,
          expression,
          note: "与之前轮次表达式重复，停止迭代",
        };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        break;
      }

      const validation = validateFactorExpression(expression);
      if (!validation.ok) {
        consecutiveFailures += 1;
        seen.add(expression);
        const record: IterateRound = {
          round,
          expression,
          error: `表达式不合法：${validation.reason}`,
        };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        feedback = renderInvalidFeedback(expression, validation.reason, round);
        await markProgress(runId, round, params.maxRounds, best, `第 ${round} 轮表达式不合法`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }

      const runnable = await quant.validateFactorExpression(expression);
      if (!runnable.valid) {
        consecutiveFailures += 1;
        seen.add(expression);
        const reason = runnable.reason ?? "运行校验未通过";
        const record: IterateRound = {
          round,
          expression,
          error: `运行校验未通过：${reason}`,
        };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        feedback = renderInvalidFeedback(expression, reason, round);
        await markProgress(runId, round, params.maxRounds, best, `第 ${round} 轮运行校验未通过`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }
      seen.add(expression);

      let evaluation;
      try {
        evaluation = await quant.evaluateFactor({
          expression,
          horizon: params.horizon,
          layers: params.layers,
          bars: params.bars,
          maxSymbols: params.maxSymbols,
          minSymbols: params.minSymbols,
          horizons: DECAY_HORIZONS,
          validRatio: params.validRatio,
        });
      } catch (error) {
        consecutiveFailures += 1;
        const message = (error as Error)?.message ?? String(error);
        const record: IterateRound = {
          round,
          expression,
          error: `因子检验失败：${message}`,
        };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        feedback = renderInvalidFeedback(expression, `因子检验失败：${message}`, round);
        await markProgress(runId, round, params.maxRounds, best, `第 ${round} 轮检验失败`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }

      consecutiveFailures = 0;
      const summary = summarizeFactorEvaluation(evaluation);
      const record: IterateRound = { round, expression, summary };
      trajectory.push(record);
      await saveIterationRound(runId, record);
      if (!best || summary.score > (best.summary?.score ?? Number.NEGATIVE_INFINITY)) {
        best = record;
      }

      iterateLog.info(
        {
          job_run_id: runId,
          round,
          expression,
          ic: summary.icMean,
          icir: summary.icir,
          validIc: summary.validIcMean,
          validIcir: summary.validIcir,
        },
        "AI 迭代轮次完成",
      );
      await markProgress(runId, round, params.maxRounds, best, `第 ${round} 轮完成`);
      if (isFactorGoodEnough(summary)) break;
      feedback = renderFactorFeedback(evaluation, round);
    }

    if (best) {
      await db
        .update(factorIteration)
        .set({ isBest: true })
        .where(and(eq(factorIteration.runId, runId), eq(factorIteration.round, best.round)))
        .catch(() => undefined);
    }

    const validPart =
      best?.summary?.validIcMean == null
        ? ""
        : ` | 样本外IC=${formatMetric(best.summary.validIcMean)}`;
    const bestLine =
      best?.summary != null
        ? `最佳：第 ${best.round} 轮 | IC=${formatMetric(best.summary.icMean)} ICIR=${formatMetric(best.summary.icir, 3)}${validPart} | 表达式：${best.expression ?? "—"}`
        : "未产出可用表达式";

    await db
      .update(jobRun)
      .set({
        status: "success",
        finishedAt: new Date(),
        processed: trajectory.length,
        message: [
          bestLine,
          `共 ${trajectory.length} 轮，轨迹见 GET /api/v1/factors/iterate/runs/${runId}`,
        ].join("\n"),
      })
      .where(eq(jobRun.id, runId))
      .catch(() => undefined);
    iterateLog.info(
      {
        job_run_id: runId,
        rounds: trajectory.length,
        best: best?.expression ?? null,
      },
      "AI 迭代完成",
    );
  }).catch(async (error) => {
    iterateLog.error({ err: error, job_run_id: runId }, "AI 迭代异常终止");
    await db
      .update(jobRun)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: (error as Error)?.message ?? String(error),
      })
      .where(eq(jobRun.id, runId))
      .catch(() => undefined);
  });
}

export interface FactorIterationRequest {
  description?: string;
  rounds?: number;
  horizon?: number;
  layers?: number;
  bars?: number;
  maxSymbols?: number;
  minSymbols?: number;
  validRatio?: number;
  asOf?: string;
}

export async function startFactorIteration(
  request: FactorIterationRequest,
): Promise<{ runId: number; total: number }> {
  const description = request.description?.trim();
  if (!description) {
    throw new WorkflowActionError("description is required", 400);
  }

  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const active = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(
      and(
        eq(jobRun.jobType, ITERATE_JOB_TYPE),
        eq(jobRun.status, "running"),
        isNull(jobRun.finishedAt),
        gte(jobRun.startedAt, cutoff),
      ),
    )
    .limit(1);
  if (active.length > 0) {
    throw new WorkflowActionError("已有 AI 迭代任务进行中，请稍候", 409);
  }

  const params: IterateParams = {
    description,
    maxRounds: Math.min(toPositiveInteger(request.rounds) ?? DEFAULT_ROUNDS, MAX_ROUNDS),
    horizon: toPositiveInteger(request.horizon),
    layers: toPositiveInteger(request.layers),
    bars: toPositiveInteger(request.bars) ?? DEFAULT_BARS,
    maxSymbols: toPositiveInteger(request.maxSymbols) ?? DEFAULT_MAX_SYMBOLS,
    minSymbols: toPositiveInteger(request.minSymbols),
    validRatio: toValidRatio(request.validRatio ?? DEFAULT_VALID_RATIO),
    asOf: toAsOf(request.asOf),
  };
  const tradeDate = await getSyncTradeDate();
  const [inserted] = await db
    .insert(jobRun)
    .values({
      jobType: ITERATE_JOB_TYPE,
      status: "running",
      startedAt: new Date(),
      tradeDate,
      total: params.maxRounds,
      processed: 0,
      message: `准备 AI 迭代（最多 ${params.maxRounds} 轮）`,
    })
    .returning({ id: jobRun.id });
  if (inserted?.id == null) {
    throw new WorkflowActionError("任务创建失败，请稍后重试。", 500);
  }

  void executeFactorIteration(inserted.id, params);
  return { runId: inserted.id, total: params.maxRounds };
}

export async function waitForFactorIteration(
  runId: number,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{
  id: number;
  status: string;
  message: string | null;
  error: string | null;
}> {
  const deadline = Date.now() + (options.timeoutMs ?? 30 * 60 * 1000);
  while (true) {
    options.signal?.throwIfAborted();
    const [run] = await db
      .select({
        id: jobRun.id,
        status: jobRun.status,
        message: jobRun.message,
        error: jobRun.error,
      })
      .from(jobRun)
      .where(and(eq(jobRun.id, runId), eq(jobRun.jobType, ITERATE_JOB_TYPE)));
    if (!run) {
      throw new WorkflowActionError("AI 迭代任务不存在", 404);
    }
    if (run.status !== "running") return run;
    if (Date.now() >= deadline) {
      throw new WorkflowActionError("AI 迭代等待超时", 500);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
