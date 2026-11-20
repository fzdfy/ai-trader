import { createLogger } from "../../lib/logger";
import type { ResearchIndexJob } from "../../services/research-index-contracts";
import { getResearchBoss, RESEARCH_INDEX_QUEUE } from "../../services/research-queue";
import { processResearchIndexJob, requeuePendingResearchDocuments } from "./processor";

const log = createLogger("research-worker");
const boss = await getResearchBoss();

async function recoverPending(): Promise<void> {
  try {
    const count = await requeuePendingResearchDocuments();
    if (count > 0) log.warn({ count }, "requeued pending research documents");
  } catch (error) {
    log.error({ err: error }, "research document recovery failed");
  }
}

await recoverPending();

await boss.work<ResearchIndexJob>(
  RESEARCH_INDEX_QUEUE,
  { batchSize: 1, pollingIntervalSeconds: 2 },
  async (jobs) => {
    for (const job of jobs) {
      try {
        await processResearchIndexJob(job.data);
        log.info({ job: job.data }, "research index job completed");
      } catch (error) {
        log.error({ err: error, job: job.data }, "research index job failed");
        throw error;
      }
    }
  },
);

setInterval(() => {
  void recoverPending();
}, 10 * 60_000);

async function shutdown(): Promise<void> {
  await boss.stop({ graceful: true });
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

log.info("ready");
