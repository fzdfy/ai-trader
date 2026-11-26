import assert from "node:assert/strict";
import test from "node:test";

import {
  runTechnicalSignalRetention,
  technicalSignalRetentionCutoff,
} from "./technical-signal-retention.ts";

test("technical snapshot retention uses a 180-day cutoff", () => {
  assert.equal(technicalSignalRetentionCutoff(new Date("2026-11-26T08:00:00.000Z")), "2026-05-30");
});

test("retention deletes snapshots and triggers but never validation evidence", async () => {
  const deleted: string[] = [];
  const result = await runTechnicalSignalRetention({
    now: () => new Date("2026-11-26T08:00:00.000Z"),
    deleteSnapshots: async () => {
      deleted.push("snapshot");
      return 3;
    },
    deleteTriggers: async () => {
      deleted.push("trigger");
      return 8;
    },
  });
  assert.deepEqual(deleted, ["snapshot", "trigger"]);
  assert.deepEqual(result, { cutoff: "2026-05-30", snapshots: 3, triggers: 8 });
});
