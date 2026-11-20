import assert from "node:assert/strict";
import test from "node:test";
import { like } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { governanceReviewTask } from "../../db/schema";
import {
  countPendingSourceReviewTasks,
  createGovernanceReviewTask,
  ensureSourceStandardReviewTask,
  getGovernanceReviewTask,
  transitionGovernanceReviewTask,
} from "./review-tasks.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "breaking review must link an OpenSpec change before completion",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    try {
      const id = await createGovernanceReviewTask({
        taskType: "source_standard_review",
        title: "破坏性来源变更",
        priority: "critical",
        ownerRole: "Data Steward",
        relatedType: "source_standard",
        relatedId: suffix,
        payloadJson: { commitSha: suffix },
      });
      await transitionGovernanceReviewTask(id, { action: "start" });
      await assert.rejects(
        transitionGovernanceReviewTask(id, {
          action: "complete",
          resultJson: { breaking: true },
        }),
        /OpenSpec/,
      );
      await transitionGovernanceReviewTask(id, {
        action: "complete",
        resultJson: {
          breaking: true,
          openspecChange: "upgrade-a-stock-data-source",
        },
      });
      assert.equal((await getGovernanceReviewTask(id))?.status, "completed");
    } finally {
      await db
        .delete(governanceReviewTask)
        .where(like(governanceReviewTask.relatedId, suffix));
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
      await db
        .delete(governanceReviewTask)
        .where(like(governanceReviewTask.relatedId, commitSha));
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
      const id = await createGovernanceReviewTask({
        taskType: "source_standard_review",
        title: "审阅来源标准",
        priority: "high",
        ownerRole: "Data Steward",
        relatedType: "source_standard",
        relatedId: suffix,
        payloadJson: { commitSha: suffix },
      });
      await transitionGovernanceReviewTask(id, {
        action: "start",
        actorUserId,
      });
      await transitionGovernanceReviewTask(id, {
        action: "complete",
        actorUserId,
        resultJson: { approved: false },
      });

      const task = await getGovernanceReviewTask(id);
      assert.deepEqual(task?.payloadJson, { commitSha: suffix });
      assert.deepEqual(task?.resultJson, { approved: false });
      assert.equal(task?.status, "completed");
      assert.deepEqual(
        task?.events.map((event) => event.eventType),
        ["created", "started", "completed"],
      );
    } finally {
      await db
        .delete(governanceReviewTask)
        .where(like(governanceReviewTask.relatedId, suffix));
    }
  },
);
