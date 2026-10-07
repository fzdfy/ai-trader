import { Hono } from "hono";
import { db } from "../db";
import { factorEvaluation, factorIteration, factorRegistry, jobRun } from "../db/schema";
import { and, asc, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { ok, created, badRequest, notFound, serverError } from "../lib/response";
import { resolveCreatorNames } from "../lib/creators";
import { mastra } from "../agent/mastra";
import {
  FACTOR_GENERATION_FAILURE,
  validateFactorExpression,
} from "../agent/mastra/agents/factor-generator";
import { validateFactorCode } from "../lib/factor-code";
import {
  isFactorGoodEnough,
  renderFactorFeedback,
  renderInvalidFeedback,
  summarizeFactorEvaluation,
  type FactorEvaluationSummary,
} from "../lib/factor-feedback";
import { quant, type FactorEvaluation } from "../lib/quant";
import { createLogger } from "../lib/logger";
import { runWithLogContext } from "../lib/request-context";
import { getSyncTradeDate } from "../workers/sync-worker/calendar";
import { STALE_RUN_MS } from "../workers/sync-worker/runner";

const factorsRoute = new Hono();

const evalLog = createLogger("factor-eval");
const iterateLog = createLogger("factor-iterate");

/** 只透传显式提供的正整数参数，其余交由 quant 侧默认值与上限钳制 */
function toPosInt(v: number | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}

/** 归一化样本外占比：只接受 (0, 0.5) 内的数（上限 0.45 留足样本内区间），其余回退 0（不切分） */
function toValidRatio(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, 0.45);
}

/**
 * 归一化 PIT 复权快照时刻（as_of）：只接受可解析的非空日期/时间串，其余返回 undefined（用最新快照）。
 * 传值时 quant 侧只采用 known_at <= asOf 的复权因子版本，实现"站在历史某时刻"回放。
 */
function toAsOf(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return Number.isFinite(Date.parse(s)) ? s : undefined;
}

/** 批量检验任务的 jobType（写入 job_run，前端据此轮询进度） */
const BATCH_JOB_TYPE = "factor-eval";
/** 批量检验默认回溯日线数 / 最大标的数，低于单因子详情默认值以控制整批耗时 */
const BATCH_DEFAULT_BARS = 250;
const BATCH_DEFAULT_MAX_SYMBOLS = 300;
/** 批量检验同时计算的衰减持有期（与 quant 侧 DEFAULT_DECAY_HORIZONS 对齐），供跨因子衰退对比 */
const BATCH_DECAY_HORIZONS = [1, 2, 3, 5, 10, 20];

/** AI 因子迭代任务的 jobType（写入 job_run，前端据此轮询进度 / 读取轨迹） */
const ITERATE_JOB_TYPE = "factor-iterate";
/** AI 迭代默认轮次与硬上限（复用 factorGenerator，每轮 = 生成 + 校验 + 评价） */
const ITERATE_DEFAULT_ROUNDS = 3;
const ITERATE_MAX_ROUNDS = 5;
/** 连续失败（生成 / 校验 / 求值）达到该次数即停止，避免无意义空转 */
const ITERATE_MAX_CONSECUTIVE_FAILURES = 2;
/** AI 迭代默认样本外占比：时间靠后的 30% 交易日作为样本外，用于检验过拟合 */
const ITERATE_VALID_RATIO = 0.3;

interface EvalTarget {
  name: string;
  category: string;
  /** 引擎表达式（kind=expression），非表达式因子为空串 */
  expression: string;
  /** Python 代码（kind=python），非代码因子为空串 */
  code: string;
}

interface EvalParams {
  horizon?: number;
  layers?: number;
  bars: number;
  maxSymbols: number;
  minSymbols?: number;
  /** PIT 复权快照时刻（ISO）：只采用 known_at <= asOf 的复权因子版本；缺省用最新快照 */
  asOf?: string;
}

/** AI 迭代参数（与 EvalParams 同口径，另加描述、轮次上限与样本外占比） */
interface IterateParams extends EvalParams {
  description: string;
  maxRounds: number;
  /** 样本外占比（0~0.5）：>0 时按交易日切分样本内/样本外，用于度量过拟合 */
  validRatio: number;
}

/** AI 迭代单轮结果（成功轮含结构化摘要，失败轮含原因） */
interface IterateRound {
  round: number;
  expression: string | null;
  summary?: FactorEvaluationSummary;
  error?: string;
  note?: string;
}

/** 指标文本格式化：null / 非有限值统一显示为「—」 */
function fmtMetric(value: number | null | undefined, digits = 4): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

/** 单因子检验结果 → factor_evaluation 行 */
function buildEvaluationValues(
  target: EvalTarget,
  params: EvalParams,
  result: FactorEvaluation,
): typeof factorEvaluation.$inferInsert {
  const ls = result.layers.longShort;
  return {
    factorName: target.name,
    category: target.category,
    horizon: params.horizon ?? 1,
    icMean: result.ic.mean,
    icStd: result.ic.std,
    icir: result.ic.icir,
    tStat: result.ic.tStat,
    icPositiveRatio: result.ic.positiveRatio,
    rankIcMean: result.rankIc.mean,
    rankIcir: result.rankIc.icir,
    longShortCumRet: ls.cumRet,
    longShortAnnRet: ls.annRet,
    longShortWinRate: ls.winRate,
    sampleCount: Math.round(result.ic.count),
    symbols: Math.round(result.universe.symbols),
    bars: Math.round(result.universe.bars),
    startDate: result.universe.startDate,
    endDate: result.universe.endDate,
    decay: result.decay,
    turnoverMean: result.turnover.mean,
    rankAutocorrMean: result.rankAutocorr.mean,
    longShortBeta: result.alphaBeta.beta,
    longShortAlpha: result.alphaBeta.annualAlpha,
    icSkew: result.icNormality.skew,
    icKurtosis: result.icNormality.kurtosis,
    diagnostics: {
      turnover: result.turnover,
      rankAutocorr: result.rankAutocorr,
      alphaBeta: result.alphaBeta,
      icNormality: result.icNormality,
      monthlyIc: result.monthlyIc,
    },
    error: null,
    elapsedMs: Math.round(result.elapsedMs),
    updatedAt: new Date(),
  };
}

/** 按因子名 upsert 检验结果（重算即覆盖） */
async function saveEvaluation(values: typeof factorEvaluation.$inferInsert): Promise<void> {
  await db
    .insert(factorEvaluation)
    .values(values)
    .onConflictDoUpdate({ target: factorEvaluation.factorName, set: values });
}

/**
 * 后台串行执行批量检验：逐个因子调 quant 计算，结果 upsert 到 factor_evaluation，
 * 进度实时写回 job_run（processed / message），供前端轮询 /evaluations/status。
 */
async function runEvaluationBatch(
  runId: number,
  targets: EvalTarget[],
  params: EvalParams,
): Promise<void> {
  const ctx = {
    requestId: crypto.randomUUID(),
    source: "manual" as const,
    jobName: BATCH_JOB_TYPE,
    jobRunId: String(runId),
  };

  await runWithLogContext(ctx, async () => {
    let succeeded = 0;
    let failed = 0;
    for (const [index, target] of targets.entries()) {
      try {
        const result = await quant.evaluateFactor({
          expression: target.expression || undefined,
          code: target.code || undefined,
          ...params,
          horizons: BATCH_DECAY_HORIZONS,
        });
        await saveEvaluation(buildEvaluationValues(target, params, result));
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const msg = (error as Error)?.message ?? String(error);
        evalLog.warn({ factor: target.name, job_run_id: runId, err: error }, "因子检验失败");
        await saveEvaluation({
          factorName: target.name,
          category: target.category,
          horizon: params.horizon ?? 1,
          sampleCount: 0,
          symbols: 0,
          bars: params.bars,
          decay: null,
          error: msg,
          updatedAt: new Date(),
        }).catch(() => undefined);
      }
      await db
        .update(jobRun)
        .set({
          processed: index + 1,
          message: `已检验 ${index + 1}/${targets.length}（成功 ${succeeded} / 失败 ${failed}）`,
        })
        .where(eq(jobRun.id, runId))
        .catch(() => undefined);
    }
    await db
      .update(jobRun)
      .set({
        status: "success",
        finishedAt: new Date(),
        message: `完成：成功 ${succeeded} / 失败 ${failed}`,
      })
      .where(eq(jobRun.id, runId))
      .catch(() => undefined);
    evalLog.info({ job_run_id: runId, succeeded, failed }, "批量检验完成");
  }).catch(async (error) => {
    evalLog.error({ err: error, job_run_id: runId }, "批量检验异常终止");
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

/** 单轮迭代结果 → factor_iteration 行（成功轮记全部指标，失败轮记 status / message） */
function buildIterationValues(
  runId: number,
  record: IterateRound,
): typeof factorIteration.$inferInsert {
  const s = record.summary;
  let status: string;
  if (s) status = "evaluated";
  else if (record.note) status = "stopped";
  else if (record.error?.startsWith("生成失败") || record.error?.startsWith("因子检验失败"))
    status = "failed";
  else status = "invalid";

  return {
    runId,
    round: record.round,
    status,
    expression: record.expression,
    icMean: s?.icMean ?? null,
    rankIcMean: s?.rankIcMean ?? null,
    icir: s?.icir ?? null,
    tStat: s?.tStat ?? null,
    positiveRatio: s?.positiveRatio ?? null,
    longShortAnnRet: s?.longShortAnnRet ?? null,
    longShortCumRet: s?.longShortCumRet ?? null,
    monotonicity: s?.monotonicity ?? null,
    retention: s?.retention ?? null,
    score: s?.score ?? null,
    sampleCount: s?.sampleCount ?? null,
    symbols: s?.symbols ?? null,
    validRatio: s?.validRatio ?? null,
    splitDate: s?.splitDate ?? null,
    validIcMean: s?.validIcMean ?? null,
    validRankIcMean: s?.validRankIcMean ?? null,
    validIcir: s?.validIcir ?? null,
    validLongShortAnnRet: s?.validLongShortAnnRet ?? null,
    validLongShortCumRet: s?.validLongShortCumRet ?? null,
    validSampleCount: s?.validSampleCount ?? null,
    message: s ? null : (record.error ?? record.note ?? null),
  };
}

/** 单轮轨迹落库（run_id + round 唯一，失败仅告警，不影响迭代主流程） */
async function saveIterationRound(runId: number, record: IterateRound): Promise<void> {
  try {
    await db.insert(factorIteration).values(buildIterationValues(runId, record));
  } catch (error) {
    iterateLog.warn({ err: error, job_run_id: runId, round: record.round }, "迭代轨迹落库失败");
  }
}

/** 写入 AI 迭代任务进度（processed 记已完成轮次，message 附当前最佳指标的简要提示） */
async function markIterateProgress(
  runId: number,
  round: number,
  total: number,
  best: IterateRound | null,
  note: string,
): Promise<void> {
  const bestPart = best?.summary
    ? `，当前最佳 IC=${fmtMetric(best.summary.icMean)} ICIR=${fmtMetric(best.summary.icir, 3)}`
    : "";
  await db
    .update(jobRun)
    .set({ processed: round, message: `${note}（${round}/${total}）${bestPart}` })
    .where(eq(jobRun.id, runId))
    .catch(() => undefined);
}

/**
 * 后台执行 AI 因子迭代闭环（路线 B 最小闭环）：
 *   生成表达式 → 静态白名单校验 → quant 运行校验 → quant 评价 → 把 IC/ICIR/分层/衰退结果回灌 LLM → 下一轮。
 *
 * 多轮复用同一个 factorGenerator（不新增 agent），仅通过 renderFactorFeedback 的反馈文本驱动改进；
 * 每轮实时写回 job_run（processed / message），最终把轨迹与最佳表达式写入 message（人在环采纳）。
 * 终止条件：达到可用阈值 / 轮次用尽 / 模型判「无法生成」/ 表达式重复 / 连续失败超限。
 */
async function runFactorIterate(runId: number, params: IterateParams): Promise<void> {
  const ctx = {
    requestId: crypto.randomUUID(),
    source: "manual" as const,
    jobName: ITERATE_JOB_TYPE,
    jobRunId: String(runId),
  };

  await runWithLogContext(ctx, async () => {
    const agent = mastra.getAgent("factorGenerator");
    const trajectory: IterateRound[] = [];
    const seen = new Set<string>();
    let feedback = "";
    let best: IterateRound | null = null;
    let consecutiveFailures = 0;

    for (let round = 1; round <= params.maxRounds; round += 1) {
      // 首轮只给原始描述；后续轮把上一轮反馈拼接在描述之后（保持同一 agent 与同一白名单）
      const input = round === 1 ? params.description : `${params.description}\n\n${feedback}`;

      let expression: string;
      try {
        const response = await agent.generate(input);
        expression = response.text.trim();
      } catch (error) {
        consecutiveFailures += 1;
        const msg = (error as Error)?.message ?? String(error);
        const record: IterateRound = { round, expression: null, error: `生成失败：${msg}` };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        feedback = renderInvalidFeedback("（生成异常）", msg, round);
        await markIterateProgress(runId, round, params.maxRounds, best, `第 ${round} 轮生成失败`);
        if (consecutiveFailures >= ITERATE_MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }

      // 哨兵：模型判定现有列/算子无法表达
      if (!expression || expression === FACTOR_GENERATION_FAILURE) {
        const record: IterateRound = { round, expression: null, note: "模型判定无法生成" };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        break;
      }

      // 去环：与之前轮次重复的表达式直接终止，避免同一表达式反复出现
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

      // 静态白名单校验：只允许白名单内的行情列 / 算子 / 运算符语法
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
        await markIterateProgress(runId, round, params.maxRounds, best, `第 ${round} 轮表达式不合法`);
        if (consecutiveFailures >= ITERATE_MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }

      // 运行校验：quant 用 AKQuant 引擎编译 + 本地真实库小样本实际求值
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
        await markIterateProgress(runId, round, params.maxRounds, best, `第 ${round} 轮运行校验未通过`);
        if (consecutiveFailures >= ITERATE_MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }
      seen.add(expression);

      // 因子检验：IC / RankIC / ICIR / 分层回测 / 衰退曲线
      let evaluation: FactorEvaluation;
      try {
        evaluation = await quant.evaluateFactor({
          expression,
          horizon: params.horizon,
          layers: params.layers,
          bars: params.bars,
          maxSymbols: params.maxSymbols,
          minSymbols: params.minSymbols,
          horizons: BATCH_DECAY_HORIZONS,
          validRatio: params.validRatio,
        });
      } catch (error) {
        consecutiveFailures += 1;
        const msg = (error as Error)?.message ?? String(error);
        const record: IterateRound = { round, expression, error: `因子检验失败：${msg}` };
        trajectory.push(record);
        await saveIterationRound(runId, record);
        feedback = renderInvalidFeedback(expression, `因子检验失败：${msg}`, round);
        await markIterateProgress(runId, round, params.maxRounds, best, `第 ${round} 轮检验失败`);
        if (consecutiveFailures >= ITERATE_MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }

      consecutiveFailures = 0;
      const summary = summarizeFactorEvaluation(evaluation);
      const record: IterateRound = { round, expression, summary };
      trajectory.push(record);
      await saveIterationRound(runId, record);
      if (!best || summary.score > (best.summary?.score ?? Number.NEGATIVE_INFINITY)) best = record;

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
      await markIterateProgress(runId, round, params.maxRounds, best, `第 ${round} 轮完成`);

      // 提前终止：|IC| 与 |ICIR| 同时达标，视为可用
      if (isFactorGoodEnough(summary)) break;

      // 反馈回灌：把本轮客观指标翻译成下一轮的改进方向
      feedback = renderFactorFeedback(evaluation, round);
    }

    // 最佳轮标记（轨迹明细已逐轮落库 factor_iteration，job_run.message 只留摘要）
    if (best) {
      await db
        .update(factorIteration)
        .set({ isBest: true })
        .where(and(eq(factorIteration.runId, runId), eq(factorIteration.round, best.round)))
        .catch(() => undefined);
    }

    const bestValidPart =
      best?.summary?.validIcMean == null
        ? ""
        : ` | 样本外IC=${fmtMetric(best.summary.validIcMean)}`;
    const bestLine =
      best?.summary != null
        ? `最佳：第 ${best.round} 轮 | IC=${fmtMetric(best.summary.icMean)} ICIR=${fmtMetric(best.summary.icir, 3)}${bestValidPart} | 表达式：${best.expression ?? "—"}`
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
    iterateLog.info({ job_run_id: runId, rounds: trajectory.length, best: best?.expression ?? null }, "AI 迭代完成");
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

/** 归一化因子定义方式：仅允许 expression（AKQuant 表达式）与 python（Python 代码） */
function normalizeKind(value: unknown): "expression" | "python" {
  return value === "python" ? "python" : "expression";
}

/** 按定义方式校验并给出要落库的 expression / code */
function resolveDefinition(
  kind: "expression" | "python",
  raw: { expression?: string; code?: string },
):
  | { ok: true; expression: string | null; code: string | null }
  | { ok: false; reason: string } {
  if (kind === "python") {
    const code = raw.code?.trim() || null;
    if (!code) return { ok: false, reason: "Python 因子必须提供代码" };
    const validation = validateFactorCode(code);
    if (!validation.ok) return { ok: false, reason: `Python 代码不合法：${validation.reason}` };
    return { ok: true, expression: null, code };
  }

  const expression = raw.expression?.trim() || null;
  if (expression) {
    const validation = validateFactorExpression(expression);
    if (!validation.ok) return { ok: false, reason: `因子表达式不合法：${validation.reason}` };
  }
  return { ok: true, expression, code: null };
}

// GET /api/v1/factors — 因子列表（公开的 + 当前用户创建的）
factorsRoute.get("/", async (c) => {
  const userId = c.req.header("X-User-Id");

  // 用户只能看到「公开的」和「自己创建的」因子
  const conditions = [eq(factorRegistry.isPublic, true)];
  if (userId) conditions.push(eq(factorRegistry.createdBy, userId));

  const rows = await db
    .select()
    .from(factorRegistry)
    .where(or(...conditions))
    .orderBy(factorRegistry.createdAt);
  const creators = await resolveCreatorNames(rows.map((r) => r.createdBy));
  return ok(
    c,
    rows.map((r) => ({ ...r, creator: creators[r.createdBy] ?? r.createdBy })),
  );
});

// GET /api/v1/factors/evaluations — 全部因子最近一次检验结果（因子名 → IC/RankIC/ICIR 等指标）
factorsRoute.get("/evaluations", async (c) => {
  const rows = await db.select().from(factorEvaluation);
  return ok(c, rows);
});

// GET /api/v1/factors/evaluations/status — 最近一次批量检验任务状态（前端轮询进度）
factorsRoute.get("/evaluations/status", async (c) => {
  const row = (
    await db
      .select({
        status: jobRun.status,
        total: jobRun.total,
        processed: jobRun.processed,
        message: jobRun.message,
        error: jobRun.error,
        startedAt: jobRun.startedAt,
        finishedAt: jobRun.finishedAt,
      })
      .from(jobRun)
      .where(eq(jobRun.jobType, BATCH_JOB_TYPE))
      .orderBy(desc(jobRun.id))
      .limit(1)
  )[0];

  if (!row) {
    return ok(c, {
      status: "idle",
      total: null,
      processed: null,
      message: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    });
  }

  // 僵尸 running（进程崩溃遗留）按阈值判定为失败，避免前端永远显示「进行中」
  const stale =
    row.status === "running" &&
    row.finishedAt == null &&
    row.startedAt != null &&
    row.startedAt.getTime() < Date.now() - STALE_RUN_MS;
  return ok(c, {
    ...row,
    status: stale ? "failed" : row.status,
    error: stale ? "interrupted (stale)" : row.error,
  });
});

// POST /api/v1/factors/evaluations/refresh — 触发批量检验（后台执行，立即返回）
factorsRoute.post("/evaluations/refresh", async (c) => {
  const userId = c.req.header("X-User-Id");
  const body = (await c.req.json().catch(() => ({}))) as {
    names?: string[];
    horizon?: number;
    layers?: number;
    bars?: number;
    maxSymbols?: number;
    minSymbols?: number;
    asOf?: string;
  };

  // 防重入：同一时刻只允许一个批量检验任务；僵尸行按 STALE_RUN_MS 判定，不阻塞新任务
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const active = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(
      and(
        eq(jobRun.jobType, BATCH_JOB_TYPE),
        eq(jobRun.status, "running"),
        isNull(jobRun.finishedAt),
        gte(jobRun.startedAt, cutoff),
      ),
    )
    .limit(1);
  if (active.length > 0) return badRequest(c, "已有批量检验任务进行中，请稍候");

  // 可见范围与 GET / 一致（公开的 + 本人创建的）；可选 names 限定子集（前端按分组传入）
  const conditions = [eq(factorRegistry.isPublic, true)];
  if (userId) conditions.push(eq(factorRegistry.createdBy, userId));
  const names = Array.isArray(body.names)
    ? body.names.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const rows = await db
    .select({
      name: factorRegistry.name,
      category: factorRegistry.category,
      expression: factorRegistry.expression,
      code: factorRegistry.code,
    })
    .from(factorRegistry)
    .where(
      names.length > 0 ? and(or(...conditions), inArray(factorRegistry.name, names)) : or(...conditions),
    );

  // 表达式因子与 Python 代码因子均可检验（各取其定义字段，其余为空串）
  const targets: EvalTarget[] = rows
    .map((row) => ({
      name: row.name,
      category: row.category,
      expression: row.expression?.trim() ?? "",
      code: row.code?.trim() ?? "",
    }))
    .filter((t) => t.expression.length > 0 || t.code.length > 0);
  if (targets.length === 0) return badRequest(c, "没有可检验的因子（缺少 expression 或 code）");

  const params: EvalParams = {
    horizon: toPosInt(body.horizon),
    layers: toPosInt(body.layers),
    bars: toPosInt(body.bars) ?? BATCH_DEFAULT_BARS,
    maxSymbols: toPosInt(body.maxSymbols) ?? BATCH_DEFAULT_MAX_SYMBOLS,
    minSymbols: toPosInt(body.minSymbols),
    asOf: toAsOf(body.asOf),
  };

  const tradeDate = await getSyncTradeDate();
  const inserted = await db
    .insert(jobRun)
    .values({
      jobType: BATCH_JOB_TYPE,
      status: "running",
      startedAt: new Date(),
      tradeDate,
      total: targets.length,
      processed: 0,
      message: `准备检验 ${targets.length} 个因子`,
    })
    .returning({ id: jobRun.id });
  const runId = inserted[0]?.id;
  if (runId == null) return serverError(c, "任务创建失败，请稍后重试。");

  // 后台执行，HTTP 立即返回 runId
  void runEvaluationBatch(runId, targets, params);

  return ok(c, { accepted: true, runId, total: targets.length });
});

// GET /api/v1/factors/iterate/status — 最近一次 AI 因子迭代任务状态（前端轮询进度 / 读取轨迹）
factorsRoute.get("/iterate/status", async (c) => {
  const row = (
    await db
      .select({
        status: jobRun.status,
        total: jobRun.total,
        processed: jobRun.processed,
        message: jobRun.message,
        error: jobRun.error,
        startedAt: jobRun.startedAt,
        finishedAt: jobRun.finishedAt,
      })
      .from(jobRun)
      .where(eq(jobRun.jobType, ITERATE_JOB_TYPE))
      .orderBy(desc(jobRun.id))
      .limit(1)
  )[0];

  if (!row) {
    return ok(c, {
      status: "idle",
      total: null,
      processed: null,
      message: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    });
  }

  // 僵尸 running（进程崩溃遗留）按阈值判定为失败，避免前端永远显示「进行中」
  const stale =
    row.status === "running" &&
    row.finishedAt == null &&
    row.startedAt != null &&
    row.startedAt.getTime() < Date.now() - STALE_RUN_MS;
  return ok(c, {
    ...row,
    status: stale ? "failed" : row.status,
    error: stale ? "interrupted (stale)" : row.error,
  });
});

// POST /api/v1/factors/iterate — AI 因子迭代闭环（后台执行，立即返回；采纳仍走 POST /api/v1/factors）
factorsRoute.post("/iterate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    description?: string;
    rounds?: number;
    horizon?: number;
    layers?: number;
    bars?: number;
    maxSymbols?: number;
    minSymbols?: number;
    validRatio?: number;
    asOf?: string;
  };
  const description = body.description?.trim();
  if (!description) return badRequest(c, "description is required");

  // 防重入：同一时刻只允许一个 AI 迭代任务；僵尸行按 STALE_RUN_MS 判定，不阻塞新任务
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
  if (active.length > 0) return badRequest(c, "已有 AI 迭代任务进行中，请稍候");

  const params: IterateParams = {
    description,
    maxRounds: Math.min(toPosInt(body.rounds) ?? ITERATE_DEFAULT_ROUNDS, ITERATE_MAX_ROUNDS),
    horizon: toPosInt(body.horizon),
    layers: toPosInt(body.layers),
    bars: toPosInt(body.bars) ?? BATCH_DEFAULT_BARS,
    maxSymbols: toPosInt(body.maxSymbols) ?? BATCH_DEFAULT_MAX_SYMBOLS,
    minSymbols: toPosInt(body.minSymbols),
    validRatio: toValidRatio(body.validRatio ?? ITERATE_VALID_RATIO),
    asOf: toAsOf(body.asOf),
  };

  const tradeDate = await getSyncTradeDate();
  const inserted = await db
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
  const runId = inserted[0]?.id;
  if (runId == null) return serverError(c, "任务创建失败，请稍后重试。");

  // 后台执行，HTTP 立即返回 runId
  void runFactorIterate(runId, params);

  return ok(c, { accepted: true, runId, total: params.maxRounds });
});

// GET /api/v1/factors/iterate/runs — 最近若干次 AI 迭代任务（按 id 倒序，供历史轨迹入口）
factorsRoute.get("/iterate/runs", async (c) => {
  const limitRaw = Number(c.req.query("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 50) : 10;

  const runs = await db
    .select({
      id: jobRun.id,
      status: jobRun.status,
      total: jobRun.total,
      processed: jobRun.processed,
      message: jobRun.message,
      error: jobRun.error,
      startedAt: jobRun.startedAt,
      finishedAt: jobRun.finishedAt,
    })
    .from(jobRun)
    .where(eq(jobRun.jobType, ITERATE_JOB_TYPE))
    .orderBy(desc(jobRun.id))
    .limit(limit);

  return ok(c, { runs });
});

// GET /api/v1/factors/iterate/runs/:runId — 单次迭代的逐轮轨迹（含各轮指标与最佳轮标记）
factorsRoute.get("/iterate/runs/:runId", async (c) => {
  const runId = Number(c.req.param("runId"));
  if (!Number.isInteger(runId) || runId <= 0) return badRequest(c, "runId 必须为正整数");

  const runs = await db
    .select({
      id: jobRun.id,
      status: jobRun.status,
      total: jobRun.total,
      processed: jobRun.processed,
      message: jobRun.message,
      error: jobRun.error,
      startedAt: jobRun.startedAt,
      finishedAt: jobRun.finishedAt,
    })
    .from(jobRun)
    .where(and(eq(jobRun.id, runId), eq(jobRun.jobType, ITERATE_JOB_TYPE)))
    .limit(1);
  const run = runs[0];
  if (!run) return notFound(c, "迭代任务不存在");

  const rounds = await db
    .select()
    .from(factorIteration)
    .where(eq(factorIteration.runId, runId))
    .orderBy(asc(factorIteration.round));

  return ok(c, { run, rounds });
});

// GET /api/v1/factors/:name — 因子详情（仅公开的或自己的可见）
factorsRoute.get("/:name", async (c) => {
  const name = c.req.param("name");
  const userId = c.req.header("X-User-Id");
  const rows = await db.select().from(factorRegistry).where(eq(factorRegistry.name, name));
  const row = rows[0];
  if (!row) return notFound(c, "Factor not found");

  // 私有且非本人创建的因子，对他人隐藏
  if (!row.isPublic && row.createdBy !== userId) return notFound(c, "Factor not found");

  const creators = await resolveCreatorNames([row.createdBy]);
  return ok(c, { ...row, creator: creators[row.createdBy] ?? row.createdBy });
});

// POST /api/v1/factors/:name/evaluate — 因子检验（IC/RankIC/ICIR + 分层回测 + 衰退曲线）
factorsRoute.post("/:name/evaluate", async (c) => {
  const name = c.req.param("name");
  const userId = c.req.header("X-User-Id");
  const row = (await db.select().from(factorRegistry).where(eq(factorRegistry.name, name)))[0];
  if (!row) return notFound(c, "Factor not found");

  // 私有且非本人创建的因子，对他人隐藏（与 GET /:name 同口径）
  if (!row.isPublic && row.createdBy !== userId) return notFound(c, "Factor not found");

  // 表达式因子走 expression；Python 代码因子走 code（quant 侧受限执行，code 优先）
  const expression = row.expression?.trim() ?? "";
  const code = row.code?.trim() ?? "";
  if (!expression && !code) {
    return badRequest(c, "该因子缺少可检验的定义（expression 或 code）");
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    horizon?: number;
    layers?: number;
    bars?: number;
    maxSymbols?: number;
    minSymbols?: number;
    horizons?: number[];
    validRatio?: number;
    asOf?: string;
  };

  // 只透传显式提供的正整数参数，其余交由 quant 侧默认值与上限钳制
  try {
    const result = await quant.evaluateFactor({
      expression: expression || undefined,
      code: code || undefined,
      horizon: toPosInt(body.horizon),
      layers: toPosInt(body.layers),
      bars: toPosInt(body.bars),
      maxSymbols: toPosInt(body.maxSymbols),
      minSymbols: toPosInt(body.minSymbols),
      horizons: Array.isArray(body.horizons)
        ? body.horizons.map(toPosInt).filter((h): h is number => h != null)
        : undefined,
      validRatio: toValidRatio(body.validRatio),
      asOf: toAsOf(body.asOf),
    });
    return ok(c, result);
  } catch (error) {
    console.error("[factors] evaluate error:", error);
    return serverError(c, "因子检验服务暂时不可用，请稍后重试。");
  }
});

// POST /api/v1/factors — 创建因子（name + kind + expression/code + description + isPublic）
factorsRoute.post("/", async (c) => {
  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    kind?: string;
    expression?: string;
    code?: string;
    isPublic?: boolean;
  };
  const name = body.name?.trim();
  if (!name) return badRequest(c, "name is required");

  // 按定义方式校验：expression 走 AKQuant 白名单，python 走代码校验
  const kind = normalizeKind(body.kind);
  const definition = resolveDefinition(kind, body);
  if (!definition.ok) return badRequest(c, definition.reason);

  // 记录创建者：优先取请求头中的用户 ID，缺省为 system
  const createdBy = c.req.header("X-User-Id") ?? "system";

  // 用户自定义因子：label 复用 name，分类固定为 custom，方向默认正向
  const inserted = await db
    .insert(factorRegistry)
    .values({
      name,
      label: name,
      category: "custom",
      direction: 1,
      description: body.description?.trim() ?? "",
      kind,
      expression: definition.expression,
      code: definition.code,
      createdBy,
      isPublic: body.isPublic ?? false, // 用户自定义因子默认私有
    })
    .onConflictDoNothing()
    .returning();

  // 重名时返回已存在的因子，避免主键冲突报错
  const row =
    inserted[0] ??
    (await db.select().from(factorRegistry).where(eq(factorRegistry.name, name)))[0];

  if (!row) return notFound(c, "Factor not found");

  const creators = await resolveCreatorNames([row.createdBy]);
  const result = { ...row, creator: creators[row.createdBy] ?? row.createdBy };
  return inserted[0] ? created(c, result) : ok(c, result);
});

// PATCH /api/v1/factors/:name — 编辑因子（仅创建者本人可改）
factorsRoute.patch("/:name", async (c) => {
  const name = c.req.param("name");
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = (await c.req.json()) as {
    label?: string;
    kind?: string;
    expression?: string;
    code?: string;
    description?: string;
    isPublic?: boolean;
  };

  const row = (await db.select().from(factorRegistry).where(eq(factorRegistry.name, name)))[0];
  if (!row) return notFound(c, "Factor not found");

  // 仅创建者本人可编辑
  if (row.createdBy !== userId) return c.json({ success: false, error: "Forbidden" }, 403);

  // 定义方式可切换；未显式传 kind 时沿用原值，并按最终方式重新校验
  const nextKind = body.kind === undefined ? normalizeKind(row.kind) : normalizeKind(body.kind);
  const definitionChanged =
    body.kind !== undefined || body.expression !== undefined || body.code !== undefined;

  const nextDefinition = definitionChanged
    ? resolveDefinition(nextKind, {
        expression: body.expression ?? row.expression ?? undefined,
        code: body.code ?? row.code ?? undefined,
      })
    : null;
  if (nextDefinition && !nextDefinition.ok) return badRequest(c, nextDefinition.reason);

  const updated = (
    await db
      .update(factorRegistry)
      .set({
        ...(body.label?.trim() ? { label: body.label.trim() } : {}),
        ...(definitionChanged
          ? {
              kind: nextKind,
              expression: nextDefinition!.expression,
              code: nextDefinition!.code,
            }
          : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(typeof body.isPublic === "boolean" ? { isPublic: body.isPublic } : {}),
      })
      .where(eq(factorRegistry.name, name))
      .returning()
  )[0];
  if (!updated) return notFound(c, "Factor not found");

  const creators = await resolveCreatorNames([updated.createdBy]);
  return ok(c, { ...updated, creator: creators[updated.createdBy] ?? updated.createdBy });
});

// DELETE /api/v1/factors/:name — 删除因子（仅创建者本人可删，系统因子不可删）
factorsRoute.delete("/:name", async (c) => {
  const name = c.req.param("name");
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const row = (await db.select().from(factorRegistry).where(eq(factorRegistry.name, name)))[0];
  if (!row) return notFound(c, "Factor not found");

  // 仅创建者本人可删除；系统内置因子不允许删除
  if (row.createdBy !== userId) return c.json({ success: false, error: "Forbidden" }, 403);

  await db.delete(factorRegistry).where(eq(factorRegistry.name, name));
  return ok(c, { name });
});

// POST /api/v1/factors/generate — AI 根据描述生成因子表达式
factorsRoute.post("/generate", async (c) => {
  const body = (await c.req.json()) as { description?: string };
  const description = body.description?.trim();
  if (!description) return badRequest(c, "description is required");

  try {
    const agent = mastra.getAgent("factorGenerator");
    const response = await agent.generate(description);
    const expression = response.text.trim();

    // 模型明确判定「无法表达」时，直接透传哨兵文案（前端据此给出提示）
    if (expression === FACTOR_GENERATION_FAILURE) {
      return ok(c, { expression: FACTOR_GENERATION_FAILURE });
    }

    // 强制校验：表达式只能由白名单内的「行情列 / 算子 / 运算符与语法」构成
    const validation = validateFactorExpression(expression);
    if (!validation.ok) {
      console.warn(
        "[factors] 因子表达式未通过校验：",
        validation.reason,
        "| 原始输出：",
        expression,
      );
      return ok(c, { expression: FACTOR_GENERATION_FAILURE });
    }

    // 运行校验：quant 用 AKQuant 引擎编译 + 本地真实库小样本实际求值，
    // 补白名单覆盖不到的运行期语义（算子漂移、缺失行情列、除零导致的全 NaN 等）
    const runnable = await quant.validateFactorExpression(expression);
    if (!runnable.valid) {
      console.warn(
        "[factors] 因子表达式未通过运行校验：",
        runnable.stage,
        runnable.reason,
        "| 样本：",
        runnable.sampleSymbols.join(","),
      );
      return ok(c, { expression: FACTOR_GENERATION_FAILURE, reason: runnable.reason ?? undefined });
    }

    return ok(c, { expression });
  } catch (error) {
    console.error("[factors] generate expression error:", error);
    return serverError(c, "AI 生成服务暂时不可用，请稍后重试。");
  }
});

/** 剥离模型偶尔裹上的 Markdown 代码块围栏，避免围栏被当作代码写入数据库 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

// POST /api/v1/factors/generate-code — AI 根据描述生成因子代码，并校验能否运行
factorsRoute.post("/generate-code", async (c) => {
  const body = (await c.req.json()) as { description?: string };
  const description = body.description?.trim();
  if (!description) return badRequest(c, "description is required");

  try {
    const agent = mastra.getAgent("factorCodeGenerator");
    const response = await agent.generate(description);
    const code = stripCodeFence(response.text);

    // 模型明确判定「无法表达」时，直接透传哨兵文案（前端据此给出提示）
    if (!code || code === FACTOR_GENERATION_FAILURE) {
      return ok(c, { code: FACTOR_GENERATION_FAILURE });
    }

    // 快速拒绝：与 quant 侧同源的 AST 白名单静态校验
    const staticCheck = validateFactorCode(code);
    if (!staticCheck.ok) {
      console.warn("[factors] 因子代码未通过静态校验：", staticCheck.reason, "| 原始输出：", code);
      return ok(c, { code: FACTOR_GENERATION_FAILURE, reason: staticCheck.reason });
    }

    // 运行校验：quant 用本地真实库小样本实际执行 compute，确认能跑通且产出有效数值
    const runnable = await quant.validateFactorCode(code);
    if (!runnable.valid) {
      console.warn(
        "[factors] 因子代码未通过运行校验：",
        runnable.stage,
        runnable.reason,
        "| 样本：",
        runnable.sampleSymbols.join(","),
      );
      return ok(c, { code: FACTOR_GENERATION_FAILURE, reason: runnable.reason ?? undefined });
    }

    return ok(c, { code });
  } catch (error) {
    console.error("[factors] generate code error:", error);
    return serverError(c, "AI 生成服务暂时不可用，请稍后重试。");
  }
});

// POST /api/v1/factors/validate-expression — 校验因子表达式（供用户粘贴 / 手写后「测试」）
factorsRoute.post("/validate-expression", async (c) => {
  const body = (await c.req.json()) as { expression?: string };
  const expression = body.expression?.trim();
  if (!expression) return badRequest(c, "expression is required");

  // 快速拒绝：只允许白名单内的「行情列 / 算子 / 运算符与语法」
  const validation = validateFactorExpression(expression);
  if (!validation.ok) {
    return ok(c, { valid: false, stage: "syntax", reason: validation.reason, sampleSymbols: [] });
  }

  // 运行校验：quant 用 AKQuant 引擎编译 + 本地真实库小样本实际求值，确认能跑通且产出有效数值
  try {
    const result = await quant.validateFactorExpression(expression);
    return ok(c, result);
  } catch (error) {
    console.error("[factors] validate expression error:", error);
    return serverError(c, "运行校验服务暂时不可用，请稍后重试。");
  }
});

// POST /api/v1/factors/validate-code — 校验因子 Python 代码（供用户粘贴 / 手写后「测试」）
factorsRoute.post("/validate-code", async (c) => {
  const body = (await c.req.json()) as { code?: string };
  const code = body.code?.trim();
  if (!code) return badRequest(c, "code is required");

  // 快速拒绝：与 quant 侧同源的 AST 白名单静态校验
  const staticCheck = validateFactorCode(code);
  if (!staticCheck.ok) {
    return ok(c, { valid: false, stage: "syntax", reason: staticCheck.reason, sampleSymbols: [] });
  }

  // 运行校验：quant 用本地真实库小样本实际执行 compute，确认能跑通且产出有效数值
  try {
    const result = await quant.validateFactorCode(code);
    return ok(c, result);
  } catch (error) {
    console.error("[factors] validate code error:", error);
    return serverError(c, "运行校验服务暂时不可用，请稍后重试。");
  }
});

export { factorsRoute };
