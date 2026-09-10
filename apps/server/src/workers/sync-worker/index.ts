import cron from "node-cron";
import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { db } from "../../db";
import { jobRun, tradingCalendar } from "../../db/schema";
import { CRON_JOBS, type CronJobConfig } from "./cron-config";
import { isTradeDay, isAfterMarketClose, localDateStr } from "./calendar";
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

type PipeName =
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

const RUNNERS: Record<PipeName, () => Promise<void>> = {
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

/**
 * 启动清理：cron 任务由本进程执行，进程重启后任务中断且 status 停在 running，
 * 启动时统一标记为 failed（只清理非 sync-manual，手动同步由 server 进程管理）。
 */
async function cleanupInterruptedJobs(): Promise<void> {
  try {
    await db
      .update(jobRun)
      .set({ status: "failed", error: "interrupted (worker restart)", finishedAt: new Date() })
      .where(and(eq(jobRun.status, "running"), isNull(jobRun.finishedAt), ne(jobRun.jobType, "sync-manual")));
  } catch (error) {
    console.error("[sync-worker] cleanup interrupted jobs failed:", error);
  }
}

function wrapJob(name: string, fn: () => Promise<void>) {
  return async () => {
    if (running.has(name)) return;
    running.add(name);
    let runId: number | null = null;
    try {
      const inserted = await db
        .insert(jobRun)
        .values({ jobType: name, status: "running", startedAt: new Date() })
        .returning({ id: jobRun.id });
      runId = inserted[0]?.id ?? null;

      // 在 job_run 上下文中执行管道：管道内 updateProgress() 实时上报进度
      if (runId != null) {
        await runWithProgress(runId, fn);
      } else {
        await fn();
      }

      if (runId != null) {
        await db
          .update(jobRun)
          .set({ status: "success", finishedAt: new Date() })
          .where(eq(jobRun.id, runId));
      }
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
    } finally {
      running.delete(name);
    }
  };
}

/** 活跃时段窗口（分钟）：07:00–23:00，覆盖盘前盘后与晚间公告，避免深夜空转 */
const MARKET_HOURS_START = 7 * 60;
const MARKET_HOURS_END = 23 * 60;

/** 某 jobType 今日是否已有成功记录（基于本地日期窗口） */
async function hasSuccessToday(jobType: string): Promise<boolean> {
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
async function isManualSyncRunning(): Promise<boolean> {
  const rows = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(and(eq(jobRun.jobType, "sync-manual"), eq(jobRun.status, "running"), isNull(jobRun.finishedAt)))
    .limit(1);
  return rows.length > 0;
}

/**
 * 构造调度执行函数：按 job 标志叠加守卫，cron 与启动触发复用同一份逻辑。
 *   - marketCloseOnly：交易日收盘后 + 与手动同步互斥 + 今日幂等
 *   - marketHoursOnly：交易日活跃时段
 *   - dependsOn：前置 jobType 今日已成功
 */
function makeRunner(job: CronJobConfig): () => Promise<void> {
  const run = wrapJob(job.name, RUNNERS[job.name as PipeName]);

  if (!job.marketCloseOnly && !job.marketHoursOnly && !job.dependsOn) return run;

  return async () => {
    const now = new Date();

    if (job.marketCloseOnly) {
      if (!isAfterMarketClose(now)) {
        console.log(`[sync-worker] ${job.name}: skip (盘前，仅收盘后执行)`);
        return;
      }
      if (!(await isTradeDay(now))) {
        console.log(`[sync-worker] ${job.name}: skip (非交易日)`);
        return;
      }
      // 手动同步（sync-manual）会写同一批行情表，与其互斥
      if (await isManualSyncRunning()) {
        console.log(`[sync-worker] ${job.name}: skip (手动同步进行中)`);
        return;
      }
      // 幂等：今日已成功则跳过，避免收盘后重启导致重复全市场拉取
      if (await hasSuccessToday(job.name)) {
        console.log(`[sync-worker] ${job.name}: skip (今日已成功)`);
        return;
      }
    }

    if (job.marketHoursOnly) {
      const t = now.getHours() * 60 + now.getMinutes();
      if (t < MARKET_HOURS_START || t > MARKET_HOURS_END) {
        console.log(`[sync-worker] ${job.name}: skip (非活跃时段)`);
        return;
      }
      // 周末跳过（用星期几判断，不依赖交易日历表，避免日历异常导致 news 停跑）
      const day = now.getDay(); // 0=周日 6=周六
      if (day === 0 || day === 6) {
        console.log(`[sync-worker] ${job.name}: skip (周末)`);
        return;
      }
    }

    if (job.dependsOn && !(await hasSuccessToday(job.dependsOn))) {
      console.log(`[sync-worker] ${job.name}: skip (依赖 ${job.dependsOn} 今日未完成)`);
      return;
    }

    await run();
  };
}

/**
 * 交易日历 bootstrap：今天不在日历表中时立即拉取（首次部署 / 日历过期），
 * 否则 isTradeDay(today) 返回 false，所有 marketCloseOnly 任务会被跳过。
 */
async function bootstrapCalendarIfNeeded(): Promise<boolean> {
  const today = localDateStr();
  try {
    const [row] = await db
      .select({ tradeDate: tradingCalendar.tradeDate })
      .from(tradingCalendar)
      .where(eq(tradingCalendar.tradeDate, today))
      .limit(1);
    if (row) return false;
  } catch (error) {
    console.error("[sync-worker] check trading_calendar failed:", error);
    return false;
  }
  console.log(`[sync-worker] trading_calendar missing ${today}, bootstrapping calendar...`);
  try {
    await calendarPipeRun();
    return true;
  } catch (error) {
    console.error("[sync-worker] calendar bootstrap failed:", error);
    return false;
  }
}

console.log("[sync-worker] starting (cron mode)...");
void cleanupInterruptedJobs();

const runnerByJob = new Map<string, () => Promise<void>>();

for (const job of CRON_JOBS) {
  if (!job.enabled) continue;
  if (!cron.validate(job.cron)) {
    console.error(`[sync-worker] invalid cron for ${job.name}: ${job.cron}`);
    continue;
  }
  const run = makeRunner(job);
  runnerByJob.set(job.name, run);
  cron.schedule(job.cron, run, {
    timezone: "Asia/Shanghai",
  });
  console.log(`[sync-worker] ${job.name}: "${job.cron}"`);
}

// 启动触发：先补齐交易日历（空表时），再对启用任务各执行一次；
// marketCloseOnly 任务经 makeRunner 守卫，非交易日/盘前会跳过。
setTimeout(async () => {
  const bootstrapped = await bootstrapCalendarIfNeeded();
  if (bootstrapped) {
    console.log("[sync-worker] calendar bootstrapped, market-close jobs are now enabled");
  }
  for (const job of CRON_JOBS) {
    if (!job.enabled) continue;
    if (job.name === "calendar") continue; // 已由 bootstrap 覆盖空表场景，其余依赖 cron 周期
    const run = runnerByJob.get(job.name);
    if (!run) continue;
    run().catch(() => {});
  }
}, 3000);

console.log("[sync-worker] ready");
