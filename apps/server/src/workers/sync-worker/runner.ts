/**
 * 同步管道执行器（共享模块）— 供 sync-worker（cron 调度）与手动同步接口（api/sync.ts）复用。
 *
 * 核心能力：
 *   - RUNNERS：各管道执行函数注册表
 *   - wrapJob：创建 job_run（jobType=管道名）记录 → 执行 → 标记 success/failed，返回是否成功
 *   - executeWithRetry：带 deadline 的循环重试 / 依赖等待（收盘后任务用）
 *   - hasSuccessToday / isManualSyncRunning：跨进程状态查询
 *   - runManualSync：按依赖顺序执行全部行情/板块/资金/特征管道（每个管道写独立 jobType 记录）
 *
 * 抽离原因：index.ts 顶部有 cron.schedule / setTimeout 等副作用，server 进程无法直接 import；
 * 本模块无副作用，可被 worker 与 server 两个进程安全共用。
 */
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "../../db";
import { jobRun } from "../../db/schema";
import { getSyncTradeDate } from "./calendar";
import { runWithProgress } from "./progress";
import { kline1mPipe } from "./pipes/kline-1m";
import { kline1dPipeRun } from "./pipes/kline-1d";
import { gapDetectPipe } from "./pipes/gap-detect";
import { newsPipeRun } from "./pipes/news";
import { boardsPipeRun } from "./pipes/boards";
import { boardKlinePipeRun } from "./pipes/board-kline";
import { constituentsPipeRun } from "./pipes/constituents";
import { fundFlowPipeRun } from "./pipes/fundflow";
import { featuresPipeRun } from "./pipes/features";
import { limitUpPoolPipeRun, limitUpPoolBackfillRun } from "./pipes/limit-up-pool";
import { boardFundFlowPipeRun } from "./pipes/board-fund-flow";
import { dragonTigerPipeRun, dragonTigerBackfillRun } from "./pipes/dragon-tiger";
import { hotReasonPipeRun, hotReasonBackfillRun } from "./pipes/hot-reason";
import { klinePeriodPipeRun } from "./pipes/kline-period";
import { calendarPipeRun } from "./pipes/calendar";

export type PipeName =
  | "kline-1m"
  | "kline-1d"
  | "gap-detect"
  | "news"
  | "boards"
  | "board-kline"
  | "constituents"
  | "fundflow"
  | "features"
  | "limit-up-pool"
  | "board-fund-flow"
  | "dragon-tiger"
  | "hot-reason"
  | "kline-period"
  | "calendar"
  // 历史回补（与当日同步分离的独立任务，各有独立 jobType / 幂等状态）
  | "limit-up-pool-backfill"
  | "dragon-tiger-backfill"
  | "hot-reason-backfill";

export const RUNNERS: Record<PipeName, () => Promise<void>> = {
  "kline-1m": () => kline1mPipe.run(),
  "kline-1d": () => kline1dPipeRun(),
  "gap-detect": () => gapDetectPipe.run(),
  news: () => newsPipeRun(),
  boards: () => boardsPipeRun(),
  "board-kline": () => boardKlinePipeRun(),
  constituents: () => constituentsPipeRun(),
  fundflow: () => fundFlowPipeRun(),
  features: () => featuresPipeRun(),
  "limit-up-pool": () => limitUpPoolPipeRun(),
  "board-fund-flow": () => boardFundFlowPipeRun(),
  "dragon-tiger": () => dragonTigerPipeRun(),
  "hot-reason": () => hotReasonPipeRun(),
  "kline-period": () => klinePeriodPipeRun(),
  calendar: () => calendarPipeRun(),
  "limit-up-pool-backfill": () => limitUpPoolBackfillRun(),
  "dragon-tiger-backfill": () => dragonTigerBackfillRun(),
  "hot-reason-backfill": () => hotReasonBackfillRun(),
};

const running = new Set<string>();

/** 重试间隔（毫秒），收盘后任务失败后在此间隔后重试 */
const DEFAULT_RETRY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 僵尸 running 判定阈值：running 超过 3 小时视为进程崩溃 / 请求断开悬挂遗留。
 * 手动同步包含全市场日线（5000+ 标的串行），3 小时足够覆盖正常时长。
 * 该阈值同时用于两处，语义一致：
 *   - cleanupStaleRuns：把超时 running 统一改判 failed（worker 与 server 共用）；
 *   - isManualSyncRunning：只把阈值内的 running 视为「进行中」，
 *     避免崩溃遗留的僵尸行无限期阻塞整批收盘任务。
 */
export const STALE_RUN_MS = 3 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 解析 "HH:mm" 为当天该时刻的 Date（用于 deadline 比较） */
function parseDeadline(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

type WrapOpts = {
  dependsOn?: string;
  deadline?: string;
  retryIntervalMs?: number;
  /** 手动同步（sync-manual）进行中时，不直接跳过而是等待其结束（受 deadline 约束） */
  waitManualSync?: boolean;
};

/**
 * 执行管道（可带重试循环）。
 * - 有 deadline：收盘后任务，循环执行直到成功或到达 deadline；dependsOn 未满足 / 手动同步
 *   进行中时在循环内等待（而非跳过），确保不会因为一次并发而整天不执行。
 * - 无 deadline：单次执行（news / calendar / 手动同步管道等），失败交给外层标 failed。
 */
async function executeWithRetry(
  runId: number | null,
  name: string,
  fn: () => Promise<void>,
  opts?: WrapOpts,
): Promise<void> {
  if (!opts?.deadline) {
    if (runId != null) await runWithProgress(runId, fn);
    else await fn();
    return;
  }

  const deadlineAt = parseDeadline(opts.deadline);
  const interval = opts.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  for (;;) {
    // 手动同步互斥：写同一批行情表，等待其结束（而不是跳过整批任务）
    if (opts.waitManualSync && (await isManualSyncRunning())) {
      if (Date.now() >= deadlineAt.getTime()) {
        throw new Error(`手动同步进行中且已过 deadline ${opts.deadline}`);
      }
      console.log(`[${name}] 手动同步进行中，${interval / 1000}s 后重试`);
      await sleep(interval);
      continue;
    }

    // 依赖等待：前置 jobType 今日未成功则继续等（不再依赖 cron 多次触发）
    if (opts.dependsOn && !(await hasSuccessToday(opts.dependsOn))) {
      if (Date.now() >= deadlineAt.getTime()) {
        throw new Error(`依赖 ${opts.dependsOn} 今日未成功且已过 deadline ${opts.deadline}`);
      }
      await sleep(interval);
      continue;
    }

    try {
      if (runId != null) await runWithProgress(runId, fn);
      else await fn();
      return;
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      if (Date.now() >= deadlineAt.getTime()) {
        throw new Error(`重试窗口超时（deadline ${opts.deadline}），最后错误: ${msg}`);
      }
      console.error(`[${name}] 失败，${interval / 1000}s 后重试: ${msg}`);
      await sleep(interval);
    }
  }
}

/**
 * 包装管道执行：创建 job_run（jobType=name）→ 执行 → 标记终态。
 * 返回 Promise<boolean>：true=成功，false=失败或进程内重入跳过。
 */
export function wrapJob(name: string, fn: () => Promise<void>, opts?: WrapOpts): () => Promise<boolean> {
  return async () => {
    if (running.has(name)) return false;
    running.add(name);
    let runId: number | null = null;
    try {
      const tradeDate = await getSyncTradeDate();
      const inserted = await db
        .insert(jobRun)
        .values({ jobType: name, status: "running", startedAt: new Date(), tradeDate })
        .returning({ id: jobRun.id });
      runId = inserted[0]?.id ?? null;

      // 在 job_run 上下文中执行管道：管道内 updateProgress() 实时上报进度
      await executeWithRetry(runId, name, fn, opts);

      if (runId != null) {
        await db
          .update(jobRun)
          .set({ status: "success", finishedAt: new Date() })
          .where(eq(jobRun.id, runId));
      }
      return true;
    } catch (error) {
      console.error(`[${name}] error:`, error);
      if (runId != null) {
        await db
          .update(jobRun)
          .set({
            status: "failed",
            error: (error as Error)?.message ?? String(error),
            finishedAt: new Date(),
          })
          .where(eq(jobRun.id, runId));
      }
      return false;
    } finally {
      running.delete(name);
    }
  };
}

/** 某 jobType 在当前应同步交易日是否已有成功记录（基于 trade_date） */
export async function hasSuccessToday(jobType: string): Promise<boolean> {
  const tradeDate = await getSyncTradeDate();
  // 日历表缺失（首次部署 / 日历过期）：视为未成功，不跳过，让任务正常执行并暴露问题
  if (!tradeDate) return false;
  const rows = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(
      and(
        eq(jobRun.jobType, jobType),
        eq(jobRun.status, "success"),
        eq(jobRun.tradeDate, tradeDate),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * 清理僵尸 running 任务：进程崩溃 / 请求断开悬挂导致 status 停在 running，
 * 超过 STALE_RUN_MS 后统一改判为 failed（interrupted），避免界面永远显示「运行中」、
 * 以及僵尸 sync-manual 永久阻塞收盘批次。幂等，返回清理条数。
 * worker（周期调用）与 server（查询接口 / 手动触发前）共用。
 */
export async function cleanupStaleRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const res = await db
    .update(jobRun)
    .set({ status: "failed", error: "interrupted (stale)", finishedAt: new Date() })
    .where(and(eq(jobRun.status, "running"), isNull(jobRun.finishedAt), lt(jobRun.startedAt, cutoff)));
  return res.rowCount ?? 0;
}

/**
 * 手动同步（sync-manual）是否进行中（跨进程，来自 job_run 表）。
 * 只把 STALE_RUN_MS 之内的 running 视为「进行中」：崩溃遗留的僵尸行不再无限期阻塞收盘任务。
 */
export async function isManualSyncRunning(): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const rows = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(
      and(
        eq(jobRun.jobType, "sync-manual"),
        eq(jobRun.status, "running"),
        isNull(jobRun.finishedAt),
        gte(jobRun.startedAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** 手动同步的管道顺序与依赖关系（与 cron-config 对齐） */
const MANUAL_SYNC_JOBS: { name: PipeName; dependsOn?: PipeName }[] = [
  { name: "boards" },
  { name: "board-kline", dependsOn: "boards" },
  { name: "constituents", dependsOn: "boards" },
  { name: "kline-1d" },
  { name: "kline-period", dependsOn: "kline-1d" },
  { name: "features", dependsOn: "kline-1d" },
  { name: "fundflow" },
  { name: "limit-up-pool" },
  { name: "board-fund-flow" },
  { name: "dragon-tiger" },
  { name: "hot-reason" },
];

/**
 * 手动同步：并发编排执行 8 个行情/板块/资金/特征管道（与定时任务一致的并发模型），
 * 每个管道用 wrapJob 写独立 jobType 记录（与定时任务公用 job_run 幂等状态）。
 *
 * 并发语义：
 *   - 无依赖管道（boards / kline-1d / fundflow / limit-up-pool）并行启动，写不同表互不冲突。
 *   - 有依赖管道（board-kline / constituents 依赖 boards；kline-period / features 依赖 kline-1d）
 *     挂接在各自依赖的 Promise 上：依赖成功才执行，失败则跳过。
 *   - 当日已同步完整（job_run 有当日 success）且非 force 时跳过，避免重复全市场拉取。
 *   - 单个失败不阻断其他无依赖管道；全部跑完后若存在失败/跳过，抛汇总错误使 sync-manual 整体标 failed。
 *
 * 返回本次执行的区分结果：executed = 真实执行过的管道，skipped = 因「今日已同步」而跳过的管道。
 * 调用方据此区分「本次真实拉取」与「全部跳过（无实际操作）」，避免把空操作当成一次成功同步展示。
 */
export async function runManualSync(
  opts: { force?: boolean } = {},
): Promise<{ executed: PipeName[]; skipped: PipeName[] }> {
  const { force = false } = opts;
  const failed: string[] = [];
  const executed: PipeName[] = [];
  const skipped: PipeName[] = [];
  const runs = new Map<PipeName, Promise<boolean>>();

  const runOne = async (name: PipeName): Promise<boolean> => {
    // 当日已同步完整且非强制重跑 → 跳过（视为已满足，供依赖链继续）。
    // 计入 skipped 而非 executed：跳过不等于「本次执行成功」。
    if (!force && (await hasSuccessToday(name))) {
      console.log(`[manual-sync] ${name}: skip (今日已同步)`);
      skipped.push(name);
      return true;
    }
    const ok = await wrapJob(name, RUNNERS[name])();
    if (ok) executed.push(name);
    else failed.push(name);
    return ok;
  };

  // 1) 无依赖管道并行启动
  for (const job of MANUAL_SYNC_JOBS) {
    if (!job.dependsOn) runs.set(job.name, runOne(job.name));
  }

  // 2) 有依赖管道挂接到各自依赖的 Promise：依赖成功才跑，失败则跳过
  for (const job of MANUAL_SYNC_JOBS) {
    const { name, dependsOn } = job;
    if (!dependsOn) continue;
    runs.set(
      name,
      (async () => {
        const depOk = await runs.get(dependsOn)!;
        if (!depOk) {
          console.warn(`[manual-sync] ${name}: 跳过（依赖 ${dependsOn} 未成功）`);
          failed.push(`${name}（依赖 ${dependsOn} 未成功）`);
          return false;
        }
        return runOne(name);
      })(),
    );
  }

  await Promise.all(runs.values());

  if (failed.length > 0) {
    throw new Error(`部分管道失败或跳过: ${failed.join("、")}`);
  }

  return { executed, skipped };
}
