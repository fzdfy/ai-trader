import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicDataStatus } from "./data-status.ts";

test("reports unavailable when no data timestamp exists", () => {
  assert.deepEqual(buildPublicDataStatus({ updatedAt: null, runningJobs: [] }), {
    updatedAt: null,
    availability: "unavailable",
    running: false,
  });
});

test("reports syncing when a tracked job is running", () => {
  assert.deepEqual(
    buildPublicDataStatus({
      updatedAt: "2026-11-18T00:00:00.000Z",
      runningJobs: ["boards", "kline-1d"],
    }),
    {
      updatedAt: "2026-11-18T00:00:00.000Z",
      availability: "syncing",
      running: true,
    },
  );
});

test("reports online when data exists and no job is running", () => {
  assert.deepEqual(
    buildPublicDataStatus({
      updatedAt: "2026-11-18T00:00:00.000Z",
      runningJobs: [],
    }),
    {
      updatedAt: "2026-11-18T00:00:00.000Z",
      availability: "online",
      running: false,
    },
  );
});
