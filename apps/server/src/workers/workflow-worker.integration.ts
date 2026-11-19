import assert from "node:assert/strict";
import test from "node:test";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import { getWorkflowBoss, stopWorkflowQueue, WORKFLOW_RUN_QUEUE } from "../services/workflow-queue";
import {
  getWorkflowRunDetail,
  archiveWorkflow,
  createWorkflow,
  publishWorkflow,
  saveWorkflowDraft,
  triggerManualWorkflow,
} from "../services/workflow-service";
import { runWorkflowRun } from "./workflow-worker/runner";
import type { WorkflowNodeExecutor } from "../services/workflow-engine";

const databaseName = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).pathname.slice(1)
  : "";
const runDatabaseTests =
  process.env.WORKFLOW_DB_TESTS === "1" && /workflow.*check/.test(databaseName);

test(
  "workflow queue consumes a full node chain and persists summaries",
  {
    skip: runDatabaseTests
      ? false
      : "set WORKFLOW_DB_TESTS=1 and a workflow_check DATABASE_URL to run",
  },
  async (t) => {
    const suffix = crypto.randomUUID();
    const userId = `workflow-worker-${suffix}`;
    await db.insert(user).values({
      id: userId,
      name: "Worker test",
      email: `${userId}@test.local`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const executeNode: WorkflowNodeExecutor = async ({ node }) => {
      if (node.type === "stock_pool" || node.type === "screen") {
        return {
          output: { symbols: ["600519.SH"], total: 1 },
          resultRef: { type: node.type },
        };
      }
      if (node.type === "backtest") {
        return {
          output: {
            total: 1,
            succeeded: 1,
            failed: 0,
            results: [
              {
                symbol: "600519.SH",
                ok: true,
                summary: { annualReturn: 0.12 },
              },
            ],
          },
          resultRef: { type: "backtest", symbols: ["600519.SH"] },
        };
      }
      return {
        output: { date: "2026-11-17", summary: "今日复盘", sectionCount: 9 },
        resultRef: { type: "review", date: "2026-11-17" },
      };
    };
    const boss = await getWorkflowBoss();
    await boss.purgeQueue(WORKFLOW_RUN_QUEUE).catch(() => undefined);
    await boss.work<{ runId: number }>(
      WORKFLOW_RUN_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async (jobs) => {
        for (const job of jobs) {
          await runWorkflowRun(job.data.runId, () => executeNode);
        }
      },
    );

    t.after(async () => {
      await boss.offWork(WORKFLOW_RUN_QUEUE).catch(() => undefined);
      await boss.purgeQueue(WORKFLOW_RUN_QUEUE).catch(() => undefined);
      await stopWorkflowQueue();
      await db.delete(user).where(inArray(user.id, [userId]));
    });

    const workflow = await createWorkflow(userId, {
      name: "Worker smoke test",
    });
    await saveWorkflowDraft(workflow.id, userId, {
      draftGraph: {
        schemaVersion: 1,
        nodes: [
          {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            config: { type: "manual" },
          },
          {
            id: "pool",
            type: "stock_pool",
            position: { x: 240, y: 0 },
            config: { source: "manual", symbols: ["600519.SH"] },
          },
          {
            id: "screen",
            type: "screen",
            position: { x: 480, y: 0 },
            config: { strategyId: 1, topN: 1, scope: "all" },
          },
          {
            id: "backtest",
            type: "backtest",
            position: { x: 720, y: 0 },
            config: {
              strategy: "ma_cross",
              startDate: "2025-01-01",
              endDate: "2025-12-31",
            },
          },
          {
            id: "review",
            type: "review",
            position: { x: 960, y: 0 },
            config: {},
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "trigger",
            target: "pool",
            kind: "control",
          },
          {
            id: "edge-2",
            source: "pool",
            target: "screen",
            kind: "control",
          },
          {
            id: "edge-3",
            source: "screen",
            target: "backtest",
            kind: "symbols",
          },
          {
            id: "edge-4",
            source: "backtest",
            target: "review",
            kind: "control",
          },
        ],
      },
    });
    await publishWorkflow(workflow.id, userId);
    const triggered = await triggerManualWorkflow(workflow.id, userId);

    let detail = await getWorkflowRunDetail(triggered.runId, userId);
    for (
      let attempt = 0;
      attempt < 30 && !["success", "failed"].includes(detail.run.status);
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      detail = await getWorkflowRunDetail(triggered.runId, userId);
    }

    assert.equal(detail.run.status, "success");
    assert.ok(detail.run.startedAt);
    assert.ok(detail.run.finishedAt);
    assert.equal(detail.nodes.length, 5);
    assert.ok(detail.nodes.every((node) => node.startedAt && node.finishedAt));
    const pool = detail.nodes.find((node) => node.nodeId === "pool");
    assert.deepEqual(pool?.outputSummary, {
      symbols: ["600519.SH"],
      total: 1,
    });
    assert.deepEqual(detail.nodes.find((node) => node.nodeId === "review")?.resultRef, {
      type: "review",
      date: "2026-11-17",
    });
    const persisted = await db.query.workflowRun.findFirst({
      where: (run, { eq: equals }) => equals(run.id, triggered.runId),
    });
    assert.equal(persisted?.status, "success");
    assert.ok(persisted?.finishedAt);
    assert.equal(
      (
        await db.query.workflowDefinition.findFirst({
          where: (definition, { eq: equals }) => equals(definition.id, workflow.id),
        })
      )?.id,
      workflow.id,
    );

    await archiveWorkflow(workflow.id, userId);
  },
);
