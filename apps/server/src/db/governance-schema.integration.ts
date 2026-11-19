import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from ".";
import {
  dataIncident,
  dataIncidentEvent,
  dataQualityResult,
  workTask,
  workTaskEvent,
} from "./schema";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "governance schema stores evidence and enforces statuses",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const [quality] = await db
      .insert(dataQualityResult)
      .values({
        assetKey: `asset-${suffix}`,
        ruleId: "validity.ohlcv",
        ruleVersion: 1,
        status: "failed",
        severity: "critical",
        observedValue: "0",
        detailsJson: { invalidRows: 2 },
      })
      .returning({ id: dataQualityResult.id });
    assert.ok(quality);
    assert.ok(quality.id > 0);

    await assert.rejects(
      () =>
        db.insert(dataQualityResult).values({
          assetKey: `asset-${suffix}`,
          ruleId: "invalid",
          ruleVersion: 1,
          status: "unknown",
          severity: "critical",
          detailsJson: {},
        }),
      (error: { cause?: { code?: string }; code?: string }) =>
        (error.cause?.code ?? error.code) === "23514",
    );

    const [incident] = await db
      .insert(dataIncident)
      .values({
        incidentType: "quality",
        severity: "critical",
        status: "open",
        title: "OHLCV 异常",
        description: "有效性规则失败",
        payloadJson: {},
      })
      .returning({ id: dataIncident.id });
    assert.ok(incident);
    await db.insert(dataIncidentEvent).values({
      incidentId: incident.id,
      eventType: "opened",
      payloadJson: {},
    });

    const [task] = await db
      .insert(workTask)
      .values({
        taskType: "source_standard_review",
        title: "审阅来源标准",
        status: "pending",
        priority: "high",
        ownerRole: "Data Steward",
        payloadJson: { commitSha: suffix },
      })
      .returning({ id: workTask.id });
    assert.ok(task);
    await db.insert(workTaskEvent).values({
      taskId: task.id,
      eventType: "created",
      payloadJson: {},
    });
    await assert.rejects(
      () =>
        db
          .update(workTask)
          .set({ status: "unknown" })
          .where(eq(workTask.id, task.id)),
      (error: { cause?: { code?: string }; code?: string }) =>
        (error.cause?.code ?? error.code) === "23514",
    );

    await db.delete(workTaskEvent).where(eq(workTaskEvent.taskId, task.id));
    await db.delete(workTask).where(eq(workTask.id, task.id));
    await db
      .delete(dataIncidentEvent)
      .where(eq(dataIncidentEvent.incidentId, incident.id));
    await db.delete(dataIncident).where(eq(dataIncident.id, incident.id));
    await db.delete(dataQualityResult).where(eq(dataQualityResult.id, quality.id));
  },
);
