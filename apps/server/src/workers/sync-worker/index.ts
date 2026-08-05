import cron from "node-cron";
import { CRON_JOBS } from "./cron-config";
import { kline1mPipe } from "./pipes/kline-1m";
import { kline1dPipeRun } from "./pipes/kline-1d";
import { gapDetectPipe } from "./pipes/gap-detect";
import { newsPipe } from "./pipes/news";
import { boardsPipeRun } from "./pipes/boards";

type PipeName = "kline-1m" | "kline-1d" | "gap-detect" | "news" | "boards";

const RUNNERS: Record<PipeName, () => Promise<void>> = {
  "kline-1m": () => kline1mPipe.run(),
  "kline-1d": () => kline1dPipeRun(),
  "gap-detect": () => gapDetectPipe.run(),
  news: () => newsPipe.run(),
  boards: () => boardsPipeRun(),
};

const running = new Set<string>();

function wrapJob(name: string, fn: () => Promise<void>) {
  return async () => {
    if (running.has(name)) return;
    running.add(name);
    try {
      await fn();
    } catch (error) {
      console.error(`[${name}] error:`, error);
    } finally {
      running.delete(name);
    }
  };
}

console.log("[sync-worker] starting (cron mode)...");

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
