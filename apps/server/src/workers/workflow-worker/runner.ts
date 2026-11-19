import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "../../db";
import { workflowDefinition, workflowNodeRun, workflowRun, workflowVersion } from "../../db/schema";
import { createLogger } from "../../lib/logger";
import { validateWorkflowGraph, workflowGraphSchema } from "../../lib/workflow-contracts";
import { executeWorkflowDag, type WorkflowNodeExecutor } from "../../services/workflow-engine";
import { createWorkflowNodeExecutor } from "../../services/workflow-node-executor";
import {
  consumeWorkflowSchedule,
  enqueueWorkflowRun,
  listActiveWorkflowScheduleConsumers,
  listWorkflowScheduleNames,
  setWorkflowSchedule,
  stopWorkflowScheduleConsumer,
} from "../../services/workflow-queue";
import { summarizeWorkflowJson } from "../../services/workflow-summary";
import { triggerScheduledWorkflow } from "../../services/workflow-service";
import { getSyncTradeDate } from "../sync-worker/calendar";

const log = createLogger("workflow-worker");

async function persistNodeResult(
  runId: number,
  result: {
    nodeId: string;
    nodeType: string;
    status: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    resultRef?: Record<string, unknown>;
    error?: string;
    startedAt?: Date;
    finishedAt?: Date;
    durationMs?: number;
  },
): Promise<void> {
  const values = {
    workflowRunId: runId,
    nodeId: result.nodeId,
    nodeType: result.nodeType,
    status: result.status,
    inputSummary: result.input ? summarizeWorkflowJson(result.input) : null,
    outputSummary: result.output ? summarizeWorkflowJson(result.output) : null,
    resultRef: result.resultRef ? summarizeWorkflowJson(result.resultRef) : null,
    error: result.error?.slice(0, 4000) ?? null,
    attempt: 1,
    startedAt: result.startedAt ?? null,
    finishedAt: result.finishedAt ?? null,
  };
  await db
    .insert(workflowNodeRun)
    .values(values)
    .onConflictDoUpdate({
      target: [workflowNodeRun.workflowRunId, workflowNodeRun.nodeId],
      set: values,
    });
}

async function failRun(runId: number, error: unknown): Promise<void> {
  await db
    .update(workflowRun)
    .set({
      status: "failed",
      error: ((error as Error)?.message ?? String(error)).slice(0, 4000),
      currentNodeId: null,
      finishedAt: new Date(),
    })
    .where(eq(workflowRun.id, runId));
}

export async function runWorkflowRun(
  runId: number,
  executorFactory: (userId: string) => WorkflowNodeExecutor = createWorkflowNodeExecutor,
): Promise<void> {
  const [row] = await db
    .select({
      run: workflowRun,
      workflow: workflowDefinition,
      version: workflowVersion,
    })
    .from(workflowRun)
    .innerJoin(workflowDefinition, eq(workflowDefinition.id, workflowRun.workflowId))
    .innerJoin(workflowVersion, eq(workflowVersion.id, workflowRun.versionId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  if (!row || row.run.status !== "pending") return;
  if (row.run.userId !== row.workflow.userId) {
    await failRun(runId, "运行用户与工作流所有者不一致");
    return;
  }
  const [claimed] = await db
    .update(workflowRun)
    .set({
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      error: null,
    })
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.status, "pending")))
    .returning({ id: workflowRun.id });
  if (!claimed) return;

  const parsed = workflowGraphSchema.safeParse(row.version.graphJson);
  if (!parsed.success) {
    await failRun(runId, "发布版本图结构不合法");
    return;
  }
  const validationErrors = validateWorkflowGraph(parsed.data);
  if (validationErrors.length > 0) {
    await failRun(
      runId,
      validationErrors.map((error) => `${error.code}: ${error.message}`).join("；"),
    );
    return;
  }

  const controller = new AbortController();
  let polling = false;
  const pollCancel = async () => {
    if (polling || controller.signal.aborted) return;
    polling = true;
    try {
      const [current] = await db
        .select({
          status: workflowRun.status,
          cancelRequestedAt: workflowRun.cancelRequestedAt,
        })
        .from(workflowRun)
        .where(eq(workflowRun.id, runId));
      if (current?.cancelRequestedAt || current?.status === "canceled") {
        controller.abort();
      }
    } catch (error) {
      log.warn({ err: error, workflow_run_id: runId }, "取消状态轮询失败");
    } finally {
      polling = false;
    }
  };
  const poller = setInterval(() => {
    void pollCancel();
  }, 1000);

  try {
    const result = await executeWorkflowDag(parsed.data, executorFactory(row.run.userId), {
      signal: controller.signal,
      tradeDate: (await getSyncTradeDate()) ?? undefined,
      shouldCancel: async () => {
        await pollCancel();
        return controller.signal.aborted;
      },
      onNodeStart: async (node) => {
        try {
          await db
            .insert(workflowNodeRun)
            .values({
              workflowRunId: runId,
              nodeId: node.nodeId,
              nodeType: node.nodeType,
              status: "running",
              inputSummary: summarizeWorkflowJson(node.input),
              startedAt: node.startedAt ?? new Date(),
            })
            .onConflictDoUpdate({
              target: [workflowNodeRun.workflowRunId, workflowNodeRun.nodeId],
              set: {
                status: "running",
                inputSummary: summarizeWorkflowJson(node.input),
                startedAt: node.startedAt ?? new Date(),
              },
            });
          await db
            .update(workflowRun)
            .set({ currentNodeId: node.nodeId })
            .where(eq(workflowRun.id, runId));
        } catch (error) {
          log.warn(
            { err: error, workflow_run_id: runId, node_id: node.nodeId },
            "节点开始状态落库失败",
          );
        }
      },
      onNodeFinish: async (node) => {
        try {
          await persistNodeResult(runId, node);
          const [runningNode] = await db
            .select({ nodeId: workflowNodeRun.nodeId })
            .from(workflowNodeRun)
            .where(
              and(eq(workflowNodeRun.workflowRunId, runId), eq(workflowNodeRun.status, "running")),
            )
            .limit(1);
          await db
            .update(workflowRun)
            .set({ currentNodeId: runningNode?.nodeId ?? null })
            .where(eq(workflowRun.id, runId));
        } catch (error) {
          log.warn(
            { err: error, workflow_run_id: runId, node_id: node.nodeId },
            "节点结束状态落库失败",
          );
        }
      },
    });

    for (const node of result.nodes.values()) {
      await persistNodeResult(runId, node);
    }
    const symbols = [...result.nodes.values()]
      .map((node) => node.output?.symbols)
      .find((value): value is string[] => Array.isArray(value));
    const failed = result.failedNodeId ? result.nodes.get(result.failedNodeId) : undefined;
    await db
      .update(workflowRun)
      .set({
        status: result.status,
        currentNodeId: null,
        contextJson: summarizeWorkflowJson({
          symbols: symbols ?? [],
        }),
        error:
          result.status === "canceled" ? "运行已取消；在途步骤可能完成" : (failed?.error ?? null),
        finishedAt: new Date(),
      })
      .where(eq(workflowRun.id, runId));
    log.info({ workflow_run_id: runId, status: result.status }, "workflow run finished");
  } catch (error) {
    log.error({ err: error, workflow_run_id: runId }, "workflow run failed");
    await failRun(runId, error);
  } finally {
    clearInterval(poller);
  }
}

export async function recoverInterruptedWorkflowRuns(userId?: string): Promise<number> {
  const result = await db
    .update(workflowRun)
    .set({
      status: "failed",
      error: "interrupted (worker restart)",
      currentNodeId: null,
      finishedAt: new Date(),
    })
    .where(
      and(eq(workflowRun.status, "running"), userId ? eq(workflowRun.userId, userId) : undefined),
    );
  return result.rowCount ?? 0;
}

export async function requeueOrphanedWorkflowRuns(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 5 * 60 * 1000);
  const rows = await db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(and(eq(workflowRun.status, "pending"), lt(workflowRun.createdAt, cutoff)))
    .limit(100);
  for (const row of rows) {
    await enqueueWorkflowRun(row.id).catch((error) => {
      log.warn({ err: error, workflow_run_id: row.id }, "orphaned workflow run requeue failed");
    });
  }
  return rows.length;
}

export async function cleanupWorkflowHistory(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const result = await db.delete(workflowRun).where(lt(workflowRun.createdAt, cutoff));
  return result.rowCount ?? 0;
}

export async function reconcileWorkflowSchedules(): Promise<void> {
  const rows = await db
    .select({
      workflowId: workflowDefinition.id,
      config: workflowVersion.triggerConfig,
    })
    .from(workflowDefinition)
    .innerJoin(
      workflowVersion,
      and(
        eq(workflowVersion.workflowId, workflowDefinition.id),
        eq(workflowVersion.version, workflowDefinition.currentVersion),
        eq(workflowVersion.triggerType, "schedule"),
      ),
    )
    .where(and(eq(workflowDefinition.enabled, true), isNull(workflowDefinition.archivedAt)));

  const desired = new Map<number, string>();
  for (const row of rows) {
    const config = row.config as { type: "schedule"; time: string };
    desired.set(row.workflowId, config.time);
  }
  await Promise.all(
    [...desired].map(async ([workflowId, time]) => {
      await setWorkflowSchedule(workflowId, time);
      await consumeWorkflowSchedule(workflowId, async (jobs) => {
        for (const job of jobs) {
          try {
            const result = await triggerScheduledWorkflow(
              job.data.workflowId,
              new Date(),
              job.data.time,
            );
            log.info(
              {
                workflow_id: job.data.workflowId,
                workflow_run_id: result.runId,
                skipped: result.skipped,
              },
              "scheduled workflow triggered",
            );
          } catch (error) {
            log.warn(
              { err: error, workflow_id: job.data.workflowId },
              "scheduled workflow skipped",
            );
          }
        }
      });
    }),
  );

  const desiredNames = new Set([...desired.keys()].map((workflowId) => `workflow-${workflowId}`));
  await Promise.all(
    listActiveWorkflowScheduleConsumers()
      .filter((workflowId) => !desired.has(workflowId))
      .map((workflowId) => stopWorkflowScheduleConsumer(workflowId)),
  );
  const existing = await listWorkflowScheduleNames();
  await Promise.all(
    existing
      .filter((name) => /^workflow-\d+$/.test(name) && !desiredNames.has(name))
      .map(async (name) => {
        const workflowId = Number(name.slice(9));
        await setWorkflowSchedule(workflowId, null);
        await stopWorkflowScheduleConsumer(workflowId);
      }),
  );
}
