import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user, userWorkTask } from "../db/schema";
import { createWorkTasksRoute } from "./work-tasks";

const baseUser = {
  id: "work-task-user",
  name: "User",
  email: "work-task@example.com",
  role: "user" as const,
};
const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test("work task API requires a session", async () => {
  const route = createWorkTasksRoute(async () => null);
  const response = await route.request(
    "/?view=today&localDate=2026-11-20&timezone=Asia%2FShanghai",
  );
  assert.equal(response.status, 401);
});

test("work task API rejects owner fields from the client", async () => {
  const route = createWorkTasksRoute(async () => baseUser);
  const response = await route.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "越权任务",
      userId: "another-user",
    }),
  });
  assert.equal(response.status, 400);
});

test("work task API validates local date and timezone", async () => {
  const route = createWorkTasksRoute(async () => baseUser);
  const invalidDate = await route.request(
    "/summary?localDate=2026-02-30&timezone=Asia%2FShanghai",
  );
  const invalidTimezone = await route.request(
    "/summary?localDate=2026-11-20&timezone=Mars%2FOlympus",
  );
  assert.equal(invalidDate.status, 400);
  assert.equal(invalidTimezone.status, 400);
});

test(
  "work task API creates, reads and moves only the current user's task",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const owner = {
      ...baseUser,
      id: `api-owner-${suffix}`,
      email: `api-owner-${suffix}@example.com`,
    };
    const other = {
      ...baseUser,
      id: `api-other-${suffix}`,
      email: `api-other-${suffix}@example.com`,
    };
    const now = new Date();
    await db.insert(user).values([
      {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: other.id,
        name: other.name,
        email: other.email,
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    try {
      const ownerRoute = createWorkTasksRoute(async () => owner);
      const otherRoute = createWorkTasksRoute(async () => other);
      const response = await ownerRoute.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "API 任务",
          category: "research",
          priority: "high",
          scheduledDate: "2026-11-20",
        }),
      });
      assert.equal(response.status, 201);
      const payload = (await response.json()) as { data: { id: number } };
      const id = payload.data.id;

      const list = await ownerRoute.request(
        "/?view=today&localDate=2026-11-20&timezone=Asia%2FShanghai",
      );
      assert.equal(list.status, 200);
      assert.match(await list.text(), /API 任务/);
      assert.equal((await otherRoute.request(`/${id}`)).status, 404);

      const moved = await ownerRoute.request(`/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus: "completed" }),
      });
      assert.equal(moved.status, 200);
      const detail = await ownerRoute.request(`/${id}`);
      const detailPayload = (await detail.json()) as {
        data: { status: string; events: Array<{ eventType: string }> };
      };
      assert.equal(detailPayload.data.status, "completed");
      assert.deepEqual(
        detailPayload.data.events.map((event) => event.eventType),
        ["created", "completed"],
      );
    } finally {
      await db.delete(userWorkTask).where(eq(userWorkTask.userId, owner.id));
      await db.delete(user).where(eq(user.id, owner.id));
      await db.delete(user).where(eq(user.id, other.id));
    }
  },
);
