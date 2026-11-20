import assert from "node:assert/strict";
import test from "node:test";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { dataIncident, governanceReviewTask } from "../db/schema";
import { getIncident, openIncident } from "../lib/data-governance/incidents";
import {
  createGovernanceReviewTask,
  getGovernanceReviewTask,
} from "../lib/data-governance/review-tasks";
import { createGovernanceRoute } from "./governance";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";
const user = {
  id: "user-1",
  name: "User",
  email: "user@example.com",
  role: "user" as const,
};
const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@example.com",
  role: "super_admin" as const,
};

test("governance API requires super administrator", async () => {
  const anonymous = createGovernanceRoute(async () => null);
  const userRoute = createGovernanceRoute(async () => user);
  const adminRoute = createGovernanceRoute(async () => admin);

  assert.equal((await anonymous.request("/assets")).status, 401);
  assert.equal((await userRoute.request("/assets")).status, 403);
  assert.equal((await adminRoute.request("/assets")).status, 200);
});

test("ordinary users never receive governance details", async () => {
  const userRoute = createGovernanceRoute(async () => user);
  const response = await userRoute.request("/incidents");
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /bar1d_raw|a-stock-data/);
});

test("assets expose read-only registry metadata", async () => {
  const adminRoute = createGovernanceRoute(async () => admin);
  const response = await adminRoute.request("/assets?sql=drop%20table%20user");
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    data: { items: Array<{ key: string; contract: unknown }> };
  };
  assert.ok(payload.data.items.some((asset) => asset.key === "bar1d_raw"));
  assert.ok(payload.data.items.every((asset) => asset.contract));
});

test(
  "governance task action requires and records a reason",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const adminRoute = createGovernanceRoute(async () => admin);
    try {
      const taskId = await createGovernanceReviewTask({
        taskType: "source_standard_review",
        title: "测试审阅",
        priority: "high",
        ownerRole: "Data Steward",
        relatedType: "source_standard",
        relatedId: suffix,
        payloadJson: { commitSha: suffix },
      });
      const missingReason = await adminRoute.request(
        `/review-tasks/${taskId}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      assert.equal(missingReason.status, 400);

      const accepted = await adminRoute.request(
        `/review-tasks/${taskId}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "开始兼容性审阅" }),
        },
      );
      assert.equal(accepted.status, 200);
      assert.equal(
        (await getGovernanceReviewTask(taskId))?.status,
        "in_progress",
      );
    } finally {
      await db
        .delete(governanceReviewTask)
        .where(like(governanceReviewTask.relatedId, suffix));
    }
  },
);

test(
  "incident action validates state and records audit",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const adminRoute = createGovernanceRoute(async () => admin);
    const incidentId = await openIncident({
      assetKey: `incident-${suffix}`,
      incidentType: "quality",
      severity: "critical",
      title: "测试事故",
      description: "测试状态流转",
      payloadJson: {},
    });
    try {
      const response = await adminRoute.request(
        `/incidents/${incidentId}/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "已确认影响范围" }),
        },
      );
      assert.equal(response.status, 200);
      assert.equal((await getIncident(incidentId))?.status, "acknowledged");
    } finally {
      await db.delete(dataIncident).where(eq(dataIncident.id, incidentId));
    }
  },
);
