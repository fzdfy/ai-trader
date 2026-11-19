import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { tradingCalendar, user, workflowDefinition, workflowRun } from "../db/schema";
import { getWorkflowBoss, stopWorkflowQueue, WORKFLOW_RUN_QUEUE } from "./workflow-queue";
import {
  archiveWorkflow,
  cancelWorkflowRun,
  createWorkflow,
  getWorkflowDetail,
  getWorkflowRunDetail,
  listTodayWorkflowRuns,
  listWorkflows,
  publishWorkflow,
  saveWorkflowDraft,
  setWorkflowEnabled,
  triggerScheduledWorkflow,
  triggerSyncCompleteWorkflows,
  triggerManualWorkflow,
} from "./workflow-service";
import { getSyncTradeDate, localDateStr } from "../workers/sync-worker/calendar";
import {
  cleanupWorkflowHistory,
  recoverInterruptedWorkflowRuns,
} from "../workers/workflow-worker/runner";

const databaseName = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).pathname.slice(1)
  : "";
const runDatabaseTests =
  process.env.WORKFLOW_DB_TESTS === "1" && /workflow.*check/.test(databaseName);

test(
  "workflow service isolates owners, versions drafts, and records trigger conflicts",
  {
    skip: runDatabaseTests
      ? false
      : "set WORKFLOW_DB_TESTS=1 and a workflow_check DATABASE_URL to run",
  },
  async (t) => {
    const suffix = crypto.randomUUID();
    const ownerId = `workflow-service-owner-${suffix}`;
    const otherId = `workflow-service-other-${suffix}`;
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Workflow owner",
        email: `${ownerId}@test.local`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: otherId,
        name: "Other user",
        email: `${otherId}@test.local`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    t.after(async () => {
      await getWorkflowBoss()
        .then((boss) => boss.purgeQueue(WORKFLOW_RUN_QUEUE))
        .catch(() => undefined);
      await stopWorkflowQueue();
      await db.delete(user).where(inArray(user.id, [ownerId, otherId]));
    });

    const workflow = await createWorkflow(ownerId, {
      name: "开盘准备",
    });
    const otherWorkflow = await createWorkflow(otherId, {
      name: "他人工作流",
    });

    const ownerList = await listWorkflows(ownerId);
    assert.deepEqual(
      ownerList.map((item) => item.id),
      [workflow.id],
    );
    await assert.rejects(getWorkflowDetail(otherWorkflow.id, ownerId), /工作流不存在/);

    await assert.rejects(publishWorkflow(workflow.id, ownerId), /nodes|trigger|至少/);
    await saveWorkflowDraft(workflow.id, ownerId, {
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
            config: { source: "watchlist" },
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "trigger",
            target: "pool",
            kind: "control",
          },
        ],
      },
    });
    const firstVersion = await publishWorkflow(workflow.id, ownerId);
    assert.equal(firstVersion.version, 1);

    const secondGraph = {
      ...(firstVersion.graphJson as Record<string, unknown>),
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
      ],
      edges: [
        {
          id: "edge-1",
          source: "trigger",
          target: "pool",
          kind: "control",
        },
      ],
    };
    await saveWorkflowDraft(workflow.id, ownerId, { draftGraph: secondGraph });
    let detail = await getWorkflowDetail(workflow.id, ownerId);
    assert.equal(detail.currentVersion, 1);
    detail = await getWorkflowDetail(workflow.id, ownerId);
    assert.equal(
      (
        (detail.draftGraph as { nodes: Array<{ config: unknown }> }).nodes[1]!.config as {
          source: string;
        }
      ).source,
      "manual",
    );

    const secondVersion = await publishWorkflow(workflow.id, ownerId);
    assert.equal(secondVersion.version, 2);
    detail = await getWorkflowDetail(workflow.id, ownerId);
    assert.equal(detail.currentVersion, 2);

    const firstRun = await triggerManualWorkflow(workflow.id, ownerId);
    assert.equal(firstRun.skipped, false);
    const overlappingRun = await triggerManualWorkflow(workflow.id, ownerId);
    assert.equal(overlappingRun.skipped, true);
    assert.equal(overlappingRun.reason, "active_run");

    await cancelWorkflowRun(firstRun.runId, ownerId);
    await assert.rejects(getWorkflowRunDetail(firstRun.runId, otherId), /运行记录不存在/);
    const ownerRun = await getWorkflowRunDetail(firstRun.runId, ownerId);
    assert.equal(ownerRun.run.status, "canceled");
    assert.ok((await listTodayWorkflowRuns(ownerId)).length >= 2);

    const tradeDate = localDateStr();
    await db
      .insert(tradingCalendar)
      .values({
        tradeDate,
        isTradingDay: true,
        tradeType: "full",
        reason: null,
      })
      .onConflictDoUpdate({
        target: tradingCalendar.tradeDate,
        set: { isTradingDay: true, tradeType: "full", reason: null },
      });

    const scheduleWorkflow = await createWorkflow(ownerId, {
      name: "定时工作流",
    });
    await saveWorkflowDraft(scheduleWorkflow.id, ownerId, {
      draftGraph: {
        schemaVersion: 1,
        nodes: [
          {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            config: { type: "schedule", time: "15:10" },
          },
          {
            id: "pool",
            type: "stock_pool",
            position: { x: 240, y: 0 },
            config: { source: "watchlist" },
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "trigger",
            target: "pool",
            kind: "control",
          },
        ],
      },
    });
    await publishWorkflow(scheduleWorkflow.id, ownerId);
    await setWorkflowEnabled(scheduleWorkflow.id, ownerId, true);
    const scheduled = await triggerScheduledWorkflow(scheduleWorkflow.id, new Date());
    assert.equal(scheduled.skipped, false);
    const overlappingSchedule = await triggerScheduledWorkflow(scheduleWorkflow.id, new Date());
    assert.equal(overlappingSchedule.skipped, true);

    const syncWorkflow = await createWorkflow(ownerId, {
      name: "同步工作流",
    });
    await saveWorkflowDraft(syncWorkflow.id, ownerId, {
      draftGraph: {
        schemaVersion: 1,
        nodes: [
          {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            config: { type: "sync_complete", jobType: "kline-1d" },
          },
          {
            id: "review",
            type: "review",
            position: { x: 240, y: 0 },
            config: {},
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "trigger",
            target: "review",
            kind: "control",
          },
        ],
      },
    });
    await publishWorkflow(syncWorkflow.id, ownerId);
    await setWorkflowEnabled(syncWorkflow.id, ownerId, true);
    const syncRuns = await triggerSyncCompleteWorkflows("kline-1d");
    assert.equal(syncRuns.length, 1);
    assert.equal(syncRuns[0]?.skipped, false);
    const duplicateSyncRuns = await triggerSyncCompleteWorkflows("kline-1d");
    assert.equal(duplicateSyncRuns[0]?.skipped, true);
    assert.ok(await getSyncTradeDate());

    await cancelWorkflowRun(scheduled.runId, ownerId);
    await cancelWorkflowRun(syncRuns[0]!.runId, ownerId);
    await archiveWorkflow(scheduleWorkflow.id, ownerId);
    await archiveWorkflow(syncWorkflow.id, ownerId);

    await archiveWorkflow(workflow.id, ownerId);
    assert.equal((await listWorkflows(ownerId)).length, 0);

    const oldRun = await db
      .insert(workflowRun)
      .values({
        workflowId: workflow.id,
        versionId: secondVersion.id,
        userId: ownerId,
        status: "success",
        triggerType: "manual",
        triggerRef: `old:${suffix}`,
        createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
        finishedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: workflowRun.id });
    assert.ok((await cleanupWorkflowHistory()) >= 1);
    assert.equal(
      (
        await db
          .select({ id: workflowRun.id })
          .from(workflowRun)
          .where(eq(workflowRun.id, oldRun[0]!.id))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select({ id: workflowDefinition.id })
          .from(workflowDefinition)
          .where(eq(workflowDefinition.id, workflow.id))
      ).length,
      1,
    );

    const interrupted = await db
      .insert(workflowRun)
      .values({
        workflowId: workflow.id,
        versionId: secondVersion.id,
        userId: ownerId,
        status: "running",
        triggerType: "manual",
        triggerRef: `interrupted:${suffix}`,
        startedAt: new Date(),
      })
      .returning({ id: workflowRun.id });
    assert.equal(await recoverInterruptedWorkflowRuns(ownerId), 1);
    const [recovered] = await db
      .select({ status: workflowRun.status, error: workflowRun.error })
      .from(workflowRun)
      .where(eq(workflowRun.id, interrupted[0]!.id));
    assert.equal(recovered?.status, "failed");
    assert.match(recovered?.error ?? "", /worker restart/);
  },
);
