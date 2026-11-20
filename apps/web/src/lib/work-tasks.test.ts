import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTaskDue,
  groupTodayTasks,
  localDateContext,
  type UserWorkTask,
} from "./work-tasks.ts";

function task(id: number, overrides: Partial<UserWorkTask> = {}): UserWorkTask {
  return {
    id,
    userId: "user-1",
    title: `任务 ${id}`,
    description: null,
    category: "custom",
    priority: "normal",
    status: "pending",
    scheduledDate: "2026-11-20",
    dueTime: null,
    sortOrder: id,
    blockedReason: null,
    completionNote: null,
    sourceType: null,
    sourceId: null,
    contextJson: {},
    createdAt: "2026-11-20T01:00:00.000Z",
    updatedAt: "2026-11-20T01:00:00.000Z",
    completedAt: null,
    canceledAt: null,
    ...overrides,
  };
}

test("groupTodayTasks preserves server order and excludes canceled tasks", () => {
  const grouped = groupTodayTasks([
    task(3, { sortOrder: 1 }),
    task(1, { status: "in_progress", sortOrder: 2 }),
    task(2, { status: "completed", sortOrder: 3 }),
    task(4, { status: "canceled", sortOrder: 4 }),
  ]);
  assert.deepEqual(
    grouped.pending.map((item) => item.id),
    [3],
  );
  assert.deepEqual(
    grouped.in_progress.map((item) => item.id),
    [1],
  );
  assert.deepEqual(
    grouped.completed.map((item) => item.id),
    [2],
  );
});

test("formatTaskDue marks past plan dates as overdue", () => {
  assert.deepEqual(
    formatTaskDue(
      task(1, { scheduledDate: "2026-11-18", dueTime: "16:30:00" }),
      new Date("2026-11-20T04:00:00.000Z"),
      "2026-11-20",
    ),
    { label: "逾期 2 天", overdue: true },
  );
  assert.deepEqual(
    formatTaskDue(
      task(2, { scheduledDate: "2026-11-20", dueTime: "16:30:00" }),
      new Date("2026-11-20T04:00:00.000Z"),
      "2026-11-20",
    ),
    { label: "今天 16:30", overdue: false },
  );
});

test("localDateContext uses the requested timezone and falls back safely", () => {
  assert.deepEqual(
    localDateContext(
      new Date("2026-11-20T23:30:00.000Z"),
      "Asia/Shanghai",
    ),
    { localDate: "2026-11-21", timezone: "Asia/Shanghai" },
  );
  assert.deepEqual(
    localDateContext(
      new Date("2026-11-20T23:30:00.000Z"),
      "Mars/Olympus",
    ),
    { localDate: "2026-11-21", timezone: "Asia/Shanghai" },
  );
});
