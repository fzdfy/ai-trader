import cron from "node-cron";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../../db";
import { jobRun, tradingCalendar } from "../../db/schema";
import { CRON_JOBS, type CronJobConfig } from "./cron-config";
import { isTradeDay, isAfterMarketClose, localDateStr } from "./calendar";
import { calendarPipeRun } from "./pipes/calendar";
import { wrapJob, hasSuccessToday, cleanupStaleRuns, RUNNERS, type PipeName } from "./runner";

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

/** 活跃时段窗口（分钟）：07:00–23:00，覆盖盘前盘后与晚间公告，避免深夜空转 */
const MARKET_HOURS_START = 7 * 60;
const MARKET_HOURS_END = 23 * 60;

/**
 * 构造调度执行函数：按 job 标志叠加守卫，cron 与启动触发复用同一份逻辑。
 *   - marketCloseOnly：交易日收盘后 + 今日幂等；手动同步进行中时在管道内等待（waitManualSync）
 *   - marketHoursOnly：交易日活跃时段
 *   - dependsOn：前置 jobType 今日已成功
 */
function makeRunner(job: CronJobConfig): () => Promise<void> {
  const run = wrapJob(job.name, RUNNERS[job.name as PipeName], {
    dependsOn: job.dependsOn,
    deadline: job.deadline,
    retryIntervalMs: job.retryIntervalMs,
    // 手动同步（sync-manual）会写同一批行情表，需互斥：在管道内等待其结束而非跳过整批
    waitManualSync: job.marketCloseOnly,
  });

  if (!job.marketCloseOnly && !job.marketHoursOnly) {
    return async () => {
      await run();
    };
  }

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

// 周期清理僵尸 running 任务：不依赖 server 端查询接口被访问，
// 确保崩溃遗留的 sync-manual 行能自愈（否则会阻塞后续收盘批次）。
const STALE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  void cleanupStaleRuns();
}, STALE_CLEANUP_INTERVAL_MS);

for (const job of CRON_JOBS) {
  if (!job.enabled) continue;
  if (!cron.validate(job.cron)) {
    console.error(`[sync-worker] invalid cron for ${job.name}: ${job.cron}`);
    continue;
  }
  const run = makeRunner(job);
  cron.schedule(job.cron, run, {
    timezone: "Asia/Shanghai",
  });
  console.log(`[sync-worker] ${job.name}: "${job.cron}"`);
}

// 启动初始化：仅在交易日历表缺当日记录时补一次日历（空表 / 日历过期），
// 否则 isTradeDay 恒为 false，所有 marketCloseOnly 任务会被跳过。
// 行情数据同步不在此处触发，统一交由 cron 定时调度（或手动同步）执行。
setTimeout(async () => {
  const bootstrapped = await bootstrapCalendarIfNeeded();
  if (bootstrapped) {
    console.log("[sync-worker] calendar bootstrapped");
  }
}, 3000);

console.log("[sync-worker] ready");
