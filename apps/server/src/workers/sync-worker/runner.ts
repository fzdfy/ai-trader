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
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "../../db";
import { jobRun } from "../../db/schema";
import { localDateStr } from "./calendar";
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
import { limitUpPoolPipeRun } from "./pipes/limit-up-pool";
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
  | "kline-period"
  | "calendar";

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
  "kline-period": () => klinePeriodPipeRun(),
  calendar: () => calendarPipeRun(),
};

const running = new Set<string>();

/** 重试间隔（毫秒），收盘后任务失败后在此间隔后重试 */
const DEFAULT_RETRY_INTERVAL_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 解析 "HH:mm" 为当天该时刻的 Date（用于 deadline 比较） */
function parseDeadline(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

type WrapOpts = { dependsOn?: string; deadline?: string; retryIntervalMs?: number };

/**
 * 执行管道（可带重试循环）。
 * - 有 deadline：收盘后任务，循环执行直到成功或到达 deadline；dependsOn 未满足时在循环内等待。
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
      const inserted = await db
        .insert(jobRun)
        .values({ jobType: name, status: "running", startedAt: new Date() })
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

/** 某 jobType 今日是否已有成功记录（基于本地日期窗口） */
export async function hasSuccessToday(jobType: string): Promise<boolean> {
  const today = localDateStr();
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${today}T23:59:59.999`);
  const rows = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(
      and(
        eq(jobRun.jobType, jobType),
        eq(jobRun.status, "success"),
        gte(jobRun.startedAt, start),
        lte(jobRun.startedAt, end),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** 手动同步（sync-manual）是否进行中（跨进程，来自 job_run 表） */
export async function isManualSyncRunning(): Promise<boolean> {
  const rows = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(and(eq(jobRun.jobType, "sync-manual"), eq(jobRun.status, "running"), isNull(jobRun.finishedAt)))
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
];

/**
 * 手动同步：按依赖顺序串行执行全部 8 个行情/板块/资金/特征管道，
 * 每个管道用 wrapJob 写独立 jobType 记录（与定时任务公用 job_run 幂等状态）。
 *
 * 容错语义：
 *   - 无依赖管道（boards / kline-1d / fundflow / limit-up-pool）互不阻断，
 *     单个失败仅记录并继续执行后续，不再因前置报错而终止整批。
 *   - 有依赖管道（board-kline / constituents 依赖 boards；kline-period / features 依赖 kline-1d）
 *     仅在其依赖本次成功后执行，依赖失败则跳过。
 *   - 全部跑完后若存在失败/跳过，抛汇总错误使 sync-manual 整体标 failed。
 */
export async function runManualSync(): Promise<void> {
  const results = new Map<PipeName, boolean>();
  const failed: string[] = [];

  for (const job of MANUAL_SYNC_JOBS) {
    if (job.dependsOn && !results.get(job.dependsOn)) {
      console.warn(`[manual-sync] ${job.name}: 跳过（依赖 ${job.dependsOn} 未成功）`);
      results.set(job.name, false);
      failed.push(`${job.name}（依赖 ${job.dependsOn} 未成功）`);
      continue;
    }
    const ok = await wrapJob(job.name, RUNNERS[job.name])();
    results.set(job.name, ok);
    if (!ok) failed.push(job.name);
  }

  if (failed.length > 0) {
    throw new Error(`部分管道失败或跳过: ${failed.join("、")}`);
  }
}
