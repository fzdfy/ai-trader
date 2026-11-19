import PgBoss from "pg-boss";

export const WORKFLOW_RUN_QUEUE = "workflow-run";

const boss = new PgBoss(
  process.env.DATABASE_URL ?? "postgres://ai-trader:aitrader123@localhost:5432/aitrader",
);
let startPromise: Promise<PgBoss> | null = null;
const activeScheduleWorkers = new Set<string>();

async function startedBoss(): Promise<PgBoss> {
  startPromise ??= boss.start().then(async (instance) => {
    if (!(await instance.getQueue(WORKFLOW_RUN_QUEUE))) {
      await instance.createQueue(WORKFLOW_RUN_QUEUE);
    }
    return instance;
  });
  return startPromise;
}

export async function getWorkflowBoss(): Promise<PgBoss> {
  return startedBoss();
}

export async function enqueueWorkflowRun(runId: number): Promise<void> {
  const instance = await startedBoss();
  await instance.send(
    WORKFLOW_RUN_QUEUE,
    { runId },
    {
      retryLimit: 0,
      expireInMinutes: 90,
    },
  );
}

function scheduleName(workflowId: number): string {
  return `workflow-${workflowId}`;
}

export async function setWorkflowSchedule(workflowId: number, time: string | null): Promise<void> {
  const instance = await startedBoss();
  if (!time) {
    await instance.unschedule(scheduleName(workflowId));
    return;
  }
  const [hour, minute] = time.split(":").map(Number);
  if (!(await instance.getQueue(scheduleName(workflowId)))) {
    await instance.createQueue(scheduleName(workflowId));
  }
  await instance.schedule(
    scheduleName(workflowId),
    `${minute} ${hour} * * *`,
    { workflowId, time },
    { tz: "Asia/Shanghai", retryLimit: 0 },
  );
}

export async function consumeWorkflowSchedule(
  workflowId: number,
  handler: PgBoss.WorkHandler<{ workflowId: number; time?: string }>,
): Promise<void> {
  const name = scheduleName(workflowId);
  if (activeScheduleWorkers.has(name)) return;
  const instance = await startedBoss();
  if (!(await instance.getQueue(name))) {
    await instance.createQueue(name);
  }
  await instance.work<{ workflowId: number; time?: string }>(
    name,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    handler,
  );
  activeScheduleWorkers.add(name);
}

export async function stopWorkflowScheduleConsumer(workflowId: number): Promise<void> {
  const name = scheduleName(workflowId);
  if (!activeScheduleWorkers.has(name)) return;
  const instance = await startedBoss();
  await instance.offWork(name);
  activeScheduleWorkers.delete(name);
}

export function listActiveWorkflowScheduleConsumers(): number[] {
  return [...activeScheduleWorkers].map((name) => Number(name.slice(9)));
}

export async function listWorkflowScheduleNames(): Promise<string[]> {
  const instance = await startedBoss();
  return (await instance.getSchedules())
    .map((schedule) => schedule.name)
    .filter((name) => name.startsWith("workflow-"));
}

export async function stopWorkflowQueue(): Promise<void> {
  if (!startPromise) return;
  await boss.stop({ graceful: false });
  startPromise = null;
  activeScheduleWorkers.clear();
}
