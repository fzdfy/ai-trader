import assert from "node:assert/strict";
import test from "node:test";
import { like } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { workTask } from "../../db/schema";
import {
  countPendingSourceReviewTasks,
  createWorkTask,
  ensureSourceStandardReviewTask,
  getWorkTask,
  transitionWorkTask,
} from "./work-tasks.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "breaking review must link an OpenSpec change before completion",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    try {
      const id = await createWorkTask({
        taskType: "source_standard_review",
        title: "破坏性来源变更",
        priority: "critical",
        ownerRole: "Data Steward",
        relatedType: "source_standard",
        relatedId: suffix,
        payloadJson: { commitSha: suffix },
      });
      await transitionWorkTask(id, { action: "start" });
      await assert.rejects(
        transitionWorkTask(id, {
          action: "complete",
          resultJson: { breaking: true },
        }),
        /OpenSpec/,
      );
      await transitionWorkTask(id, {
        action: "complete",
        resultJson: {
          breaking: true,
          openspecChange: "upgrade-a-stock-data-source",
        },
      });
      assert.equal((await getWorkTask(id))?.status, "completed");
    } finally {
      await db.delete(workTask).where(like(workTask.relatedId, suffix));
    }
  },
);

test(
  "same source commit creates one review task",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const commitSha = crypto.randomUUID();
    try {
      const first = await ensureSourceStandardReviewTask({
        commitSha,
        versionLabel: "3.10.4",
        previousCommitSha: "f90d67853b8108f13d286e1df20b357e2c5198a9",
        skillFileSha256: "checksum",
        snapshotPath: `docs/external/a-stock-data/${commitSha}`,
        detectedAt: "2026-11-19T00:00:00.000Z",
      });
      const second = await ensureSourceStandardReviewTask({
        commitSha,
        versionLabel: "3.10.4",
        previousCommitSha: "f90d67853b8108f13d286e1df20b357e2c5198a9",
        skillFileSha256: "checksum",
        snapshotPath: `docs/external/a-stock-data/${commitSha}`,
        detectedAt: "2026-11-19T01:00:00.000Z",
      });
      assert.equal(first, second);
      assert.equal(await countPendingSourceReviewTasks(commitSha), 1);
    } finally {
      await db.delete(workTask).where(like(workTask.relatedId, commitSha));
    }
  },
);

test(
  "work task preserves creation context after completion",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const actorUserId = `task-actor-${suffix}`;
    try {
      const id = await createWorkTask({
        taskType: "source_standard_review",
        title: "审阅来源标准",
        priority: "high",
        ownerRole: "Data Steward",
        relatedType: "source_standard",
        relatedId: suffix,
        payloadJson: { commitSha: suffix },
      });
      await transitionWorkTask(id, {
        action: "start",
        actorUserId,
      });
      await transitionWorkTask(id, {
        action: "complete",
        actorUserId,
        resultJson: { approved: false },
      });

      const task = await getWorkTask(id);
      assert.deepEqual(task?.payloadJson, { commitSha: suffix });
      assert.deepEqual(task?.resultJson, { approved: false });
      assert.equal(task?.status, "completed");
      assert.deepEqual(
        task?.events.map((event) => event.eventType),
        ["created", "started", "completed"],
      );
    } finally {
      await db.delete(workTask).where(like(workTask.relatedId, suffix));
    }
  },
);
