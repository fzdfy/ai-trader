import PgBoss from "pg-boss";

import {
  RESEARCH_INDEX_WINDOW_DAYS,
  researchIndexJobOptions,
  type ResearchIndexJob,
} from "./research-index-contracts";

export const RESEARCH_INDEX_QUEUE = "research-report-index";

const boss = new PgBoss(
  process.env.DATABASE_URL ?? "postgres://ai-trader:aitrader123@localhost:5432/aitrader",
);
let startPromise: Promise<PgBoss> | null = null;

async function startedBoss(): Promise<PgBoss> {
  startPromise ??= boss.start().then(async (instance) => {
    if (!(await instance.getQueue(RESEARCH_INDEX_QUEUE))) {
      await instance.createQueue(RESEARCH_INDEX_QUEUE, {
        retryLimit: 3,
        retryDelay: 60,
        retryBackoff: true,
      });
    }
    return instance;
  });
  return startPromise;
}

export async function getResearchBoss(): Promise<PgBoss> {
  return startedBoss();
}

export async function enqueueResearchIndexJob(job: ResearchIndexJob): Promise<string | null> {
  const instance = await startedBoss();
  return instance.send(RESEARCH_INDEX_QUEUE, job, researchIndexJobOptions(job));
}

export async function stopResearchQueue(): Promise<void> {
  if (!startPromise) return;
  await boss.stop({ graceful: false });
  startPromise = null;
}

export { RESEARCH_INDEX_WINDOW_DAYS };
