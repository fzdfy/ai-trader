import assert from "node:assert/strict";
import test from "node:test";
import { withAdminSyncLock } from "./admin-sync-lock.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "admin sync writes serialize across database sessions",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const order: string[] = [];
    await Promise.all([
      withAdminSyncLock(async () => {
        order.push("first-start");
        await new Promise((resolve) => setTimeout(resolve, 100));
        order.push("first-end");
      }),
      withAdminSyncLock(async () => {
        order.push("second-start");
        order.push("second-end");
      }),
    ]);

    const firstStart = order.indexOf("first-start");
    const firstEnd = order.indexOf("first-end");
    const secondStart = order.indexOf("second-start");
    const secondEnd = order.indexOf("second-end");
    assert.ok(firstEnd < secondStart || secondEnd < firstStart);
  },
);
