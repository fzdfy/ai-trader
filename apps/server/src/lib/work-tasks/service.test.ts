import assert from "node:assert/strict";
import test from "node:test";
import {
  workTaskCreateSchema,
  workTaskListQuerySchema,
  workTaskMoveSchema,
} from "./contracts";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { user, userWorkTask } from "../../db/schema";
import {
  createUserWorkTask,
  getUserWorkTask,
  listUserWorkTasks,
  moveUserWorkTask,
  patchUserWorkTask,
  resetUserWorkTaskOrder,
  transitionUserWorkTask,
} from "./service";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test("work task input trims the title and rejects owner fields", () => {
  const parsed = workTaskCreateSchema.parse({
    title: "  核验比亚迪出口结构  ",
    description: "补充海外销量",
    category: "research",
    priority: "high",
    scheduledDate: "2026-11-20",
  });
  assert.equal(parsed.title, "核验比亚迪出口结构");
  assert.equal("userId" in parsed, false);
  assert.equal(workTaskCreateSchema.safeParse({ title: "x", userId: "other" }).success, false);
});

test("work task list query validates local dates and IANA timezones", () => {
  assert.equal(
    workTaskListQuerySchema.safeParse({
      view: "today",
      localDate: "2026-11-20",
      timezone: "Asia/Shanghai",
    }).success,
    true,
  );
  assert.equal(
    workTaskListQuerySchema.safeParse({
      localDate: "2026-02-30",
      timezone: "Asia/Shanghai",
    }).success,
    false,
  );
  assert.equal(
    workTaskListQuerySchema.safeParse({
      localDate: "2026-11-20",
      timezone: "Mars/Olympus",
    }).success,
    false,
  );
});

test("task move requires a board status and valid neighbors", () => {
  assert.equal(
    workTaskMoveSchema.safeParse({
      targetStatus: "in_progress",
      beforeId: 10,
    }).success,
    true,
  );
  assert.equal(
    workTaskMoveSchema.safeParse({ targetStatus: "canceled" }).success,
    false,
  );
  assert.equal(
    workTaskMoveSchema.safeParse({
      targetStatus: "pending",
      beforeId: -1,
    }).success,
    false,
  );
});

test(
  "personal tasks preserve ownership and lifecycle evidence",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const ownerId = `work-task-owner-${suffix}`;
    const otherId = `work-task-other-${suffix}`;
    const now = new Date();
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Owner",
        email: `${ownerId}@example.com`,
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherId,
        name: "Other",
        email: `${otherId}@example.com`,
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    try {
      const id = await createUserWorkTask(ownerId, {
        title: "核验出口结构",
        description: "补充海外销量",
        category: "research",
        priority: "high",
        scheduledDate: "2026-11-20",
        dueTime: "16:30",
        blockedReason: null,
      });
      assert.equal(await getUserWorkTask(otherId, id), null);

      await transitionUserWorkTask(ownerId, id, { action: "start" });
      await patchUserWorkTask(ownerId, id, {
        blockedReason: "等待海关数据",
      });
      await transitionUserWorkTask(ownerId, id, {
        action: "complete",
        completionNote: "已核对",
      });
      const completed = await getUserWorkTask(ownerId, id);
      assert.equal(completed?.status, "completed");
      assert.equal(completed?.blockedReason, null);
      assert.equal(completed?.completionNote, "已核对");
      assert.deepEqual(
        completed?.events.map((event) => event.eventType),
        ["created", "started", "completed"],
      );

      await transitionUserWorkTask(ownerId, id, { action: "reopen" });
      assert.equal((await getUserWorkTask(ownerId, id))?.status, "pending");
      await transitionUserWorkTask(ownerId, id, { action: "cancel" });
      await assert.rejects(
        moveUserWorkTask(ownerId, id, { targetStatus: "completed" }),
        /已取消任务/,
      );
      await transitionUserWorkTask(ownerId, id, {
        action: "restore",
      });
      await assert.rejects(
        transitionUserWorkTask(otherId, id, { action: "complete" }),
        /工作任务不存在/,
      );
    } finally {
      await db.delete(userWorkTask).where(eq(userWorkTask.userId, ownerId));
      await db.delete(user).where(eq(user.id, ownerId));
      await db.delete(user).where(eq(user.id, otherId));
    }
  },
);

test(
  "automatic order and same-column moves persist without lifecycle noise",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const suffix = crypto.randomUUID();
    const ownerId = `work-task-order-${suffix}`;
    const now = new Date();
    await db.insert(user).values({
      id: ownerId,
      name: "Order",
      email: `${ownerId}@example.com`,
      emailVerified: true,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
    try {
      const ids = await Promise.all([
        createUserWorkTask(ownerId, {
          title: "高优先级较晚",
          description: null,
          category: "research",
          priority: "high",
          scheduledDate: "2026-11-20",
          dueTime: "17:00",
          blockedReason: null,
        }),
        createUserWorkTask(ownerId, {
          title: "高优先级较早",
          description: null,
          category: "review",
          priority: "high",
          scheduledDate: "2026-11-20",
          dueTime: "16:00",
          blockedReason: null,
        }),
        createUserWorkTask(ownerId, {
          title: "普通优先级",
          description: null,
          category: "custom",
          priority: "normal",
          scheduledDate: "2026-11-20",
          dueTime: "15:00",
          blockedReason: null,
        }),
      ]);
      await resetUserWorkTaskOrder(ownerId, "pending");
      let result = await listUserWorkTasks({
        userId: ownerId,
        view: "today",
        localDate: "2026-11-20",
        timezone: "Asia/Shanghai",
        limit: 50,
        cursor: undefined,
        q: undefined,
        category: undefined,
        status: undefined,
      });
      assert.deepEqual(
        result.items.map((item) => item.title),
        ["高优先级较早", "高优先级较晚", "普通优先级"],
      );

      await moveUserWorkTask(ownerId, ids[2]!, {
        targetStatus: "pending",
        beforeId: ids[1],
      });
      result = await listUserWorkTasks({
        userId: ownerId,
        view: "today",
        localDate: "2026-11-20",
        timezone: "Asia/Shanghai",
        limit: 50,
        cursor: undefined,
        q: undefined,
        category: undefined,
        status: undefined,
      });
      assert.equal(result.items.at(0)?.title, "普通优先级");
      assert.deepEqual(
        (await getUserWorkTask(ownerId, ids[2]!))?.events.map(
          (event) => event.eventType,
        ),
        ["created"],
      );
    } finally {
      await db.delete(userWorkTask).where(eq(userWorkTask.userId, ownerId));
      await db.delete(user).where(eq(user.id, ownerId));
    }
  },
);
