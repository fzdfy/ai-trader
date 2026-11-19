import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { adminOperationAudit, user } from "../db/schema";
import { createDataManagementRoute } from "../api/data-management.ts";
import {
  finishAdminAudit,
  insertAdminAudit,
  reconcileAdminAudits,
} from "./admin-audit.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "admin audit keeps one row while an operation moves from accepted to a terminal state",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const actorUserId = `audit-${crypto.randomUUID()}`;
    try {
      const auditId = await insertAdminAudit({
        actorUserId,
        action: "sync_run",
        reason: "手工验证同步链路",
        requestId: `request-${actorUserId}`,
        inputJson: { force: true },
      });

      await finishAdminAudit(auditId, {
        status: "running",
        jobRunId: 42,
      });
      await finishAdminAudit(auditId, {
        status: "success",
        jobRunId: 42,
        resultJson: { executed: 4, skipped: 1 },
      });

      const [row] = await db
        .select()
        .from(adminOperationAudit)
        .where(eq(adminOperationAudit.id, auditId));
      assert.equal(row?.actorUserId, actorUserId);
      assert.equal(row?.action, "sync_run");
      assert.equal(row?.reason, "手工验证同步链路");
      assert.equal(row?.status, "success");
      assert.equal(row?.jobRunId, 42);
      assert.deepEqual(row?.inputJson, { force: true });
      assert.deepEqual(row?.resultJson, { executed: 4, skipped: 1 });
      assert.ok(row?.createdAt);
      assert.ok(row?.finishedAt);
    } finally {
      await db
        .delete(adminOperationAudit)
        .where(eq(adminOperationAudit.actorUserId, actorUserId));
    }
  },
);

test(
  "admin audit records failures on the accepted row",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const actorUserId = `audit-${crypto.randomUUID()}`;
    try {
      const auditId = await insertAdminAudit({
        actorUserId,
        action: "sync_retry",
        targetJobType: "boards",
        reason: "恢复失败板块任务",
        requestId: `request-${actorUserId}`,
        inputJson: {},
      });

      await finishAdminAudit(auditId, {
        status: "failed",
        jobRunId: 43,
        error: "上游超时",
      });

      const [row] = await db
        .select()
        .from(adminOperationAudit)
        .where(eq(adminOperationAudit.id, auditId));
      assert.equal(row?.status, "failed");
      assert.equal(row?.jobRunId, 43);
      assert.equal(row?.error, "上游超时");
      assert.ok(row?.finishedAt);
    } finally {
      await db
        .delete(adminOperationAudit)
        .where(eq(adminOperationAudit.actorUserId, actorUserId));
    }
  },
);

test(
  "stale accepted audits are reconciled to interrupted",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const actorUserId = `audit-${crypto.randomUUID()}`;
    try {
      const auditId = await insertAdminAudit({
        actorUserId,
        action: "sync_run",
        reason: "模拟进程中断",
        requestId: `request-${actorUserId}`,
        inputJson: {},
      });
      await db
        .update(adminOperationAudit)
        .set({ createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) })
        .where(eq(adminOperationAudit.id, auditId));

      await reconcileAdminAudits();

      const [row] = await db
        .select()
        .from(adminOperationAudit)
        .where(eq(adminOperationAudit.id, auditId));
      assert.equal(row?.status, "interrupted");
      assert.match(row?.error ?? "", /interrupted \(stale audit\)/);
      assert.ok(row?.finishedAt);
    } finally {
      await db
        .delete(adminOperationAudit)
        .where(eq(adminOperationAudit.actorUserId, actorUserId));
    }
  },
);

test(
  "audit API resolves the operator identity",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const actorUserId = `audit-${suffix}`;
    try {
      await db.insert(user).values({
        id: actorUserId,
        name: "审计测试",
        email: `${actorUserId}@test.local`,
        emailVerified: true,
        role: "super_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const auditId = await insertAdminAudit({
        actorUserId,
        action: "sync_run",
        reason: "检查操作者展示",
        requestId: `request-${suffix}`,
        inputJson: {},
      });
      await finishAdminAudit(auditId, { status: "success", resultJson: {} });

      const route = createDataManagementRoute(async () => ({
        id: actorUserId,
        name: "审计测试",
        email: `${actorUserId}@test.local`,
        role: "super_admin",
      }));
      const response = await route.request("/audit?page=1&pageSize=20");
      const payload = (await response.json()) as {
        data: {
          items: Array<{
            id: number;
            actorName: string | null;
            actorEmail: string | null;
          }>;
        };
      };
      const item = payload.data.items.find((entry) => entry.id === auditId);

      assert.equal(item?.actorName, "审计测试");
      assert.equal(item?.actorEmail, `${actorUserId}@test.local`);
    } finally {
      await db
        .delete(adminOperationAudit)
        .where(eq(adminOperationAudit.actorUserId, actorUserId));
      await db.delete(user).where(eq(user.id, actorUserId));
    }
  },
);
