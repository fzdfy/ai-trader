import cron from "node-cron";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../../db";
import { jobRun } from "../../db/schema";
import { CRON_JOBS } from "./cron-config";
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
  | "limit-up-pool";

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

console.log("[sync-worker] starting (cron mode)...");
void cleanupInterruptedJobs();

for (const job of CRON_JOBS) {
  if (!job.enabled || job.name === "heartbeat") continue;
  if (!cron.validate(job.cron)) {
    console.error(`[sync-worker] invalid cron for ${job.name}: ${job.cron}`);
    continue;
  }
  cron.schedule(job.cron, wrapJob(job.name, RUNNERS[job.name as PipeName]), {
    timezone: "Asia/Shanghai",
  });
  console.log(`[sync-worker] ${job.name}: "${job.cron}"`);
}

// Initial run after 3s
setTimeout(() => {
  for (const job of CRON_JOBS) {
    if (!job.enabled || job.name === "heartbeat") continue;
    wrapJob(job.name, RUNNERS[job.name as PipeName])().catch(() => {});
  }
}, 3000);

console.log("[sync-worker] ready");
