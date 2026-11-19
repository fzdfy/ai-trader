import { createLogger } from "../../lib/logger";
import { getWorkflowBoss, WORKFLOW_RUN_QUEUE } from "../../services/workflow-queue";
import {
  cleanupWorkflowHistory,
  recoverInterruptedWorkflowRuns,
  reconcileWorkflowSchedules,
  requeueOrphanedWorkflowRuns,
  runWorkflowRun,
} from "./runner";

const log = createLogger("workflow-worker");
const boss = await getWorkflowBoss();

const recovered = await recoverInterruptedWorkflowRuns();
if (recovered > 0) {
  log.warn({ count: recovered }, "recovered interrupted workflow runs");
}
let reconciling = false;
const reconcile = async () => {
  if (reconciling) return;
  reconciling = true;
  try {
    await reconcileWorkflowSchedules();
  } finally {
    reconciling = false;
  }
};

await reconcile().catch((error) => {
  log.error({ err: error }, "initialize workflow schedules failed");
});
await requeueOrphanedWorkflowRuns()
  .then((count) => {
    if (count > 0) log.warn({ count }, "requeued orphaned workflow runs at startup");
  })
  .catch((error) => {
    log.error({ err: error }, "initial orphaned workflow run recovery failed");
  });

await boss.work<{ runId: number }>(
  WORKFLOW_RUN_QUEUE,
  { batchSize: 1, pollingIntervalSeconds: 2 },
  async (jobs) => {
    for (const job of jobs) {
      try {
        await runWorkflowRun(job.data.runId);
      } catch (error) {
        log.error({ err: error, workflow_run_id: job.data.runId }, "workflow job failed");
      }
    }
  },
);

setInterval(() => {
  void reconcile().catch((error) => {
    log.warn({ err: error }, "reconcile workflow schedules failed");
  });
}, 15 * 1000);

setInterval(() => {
  void requeueOrphanedWorkflowRuns()
    .then((count) => {
      if (count > 0) {
        log.warn({ count }, "requeued orphaned workflow runs");
      }
    })
    .catch((error) => {
      log.warn({ err: error }, "orphaned workflow run recovery failed");
    });
}, 60 * 1000);

setInterval(
  () => {
    void cleanupWorkflowHistory()
      .then((count) => {
        if (count > 0) log.info({ count }, "expired workflow history removed");
      })
      .catch((error) => {
        log.warn({ err: error }, "workflow history cleanup failed");
      });
  },
  24 * 60 * 60 * 1000,
);

void cleanupWorkflowHistory().catch(() => undefined);

async function shutdown(): Promise<void> {
  await boss.stop({ graceful: true });
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

log.info("ready");
