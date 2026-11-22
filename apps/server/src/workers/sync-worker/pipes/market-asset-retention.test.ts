import assert from "node:assert/strict";
import test from "node:test";
import {
  retentionCutoff,
  runMarketAssetRetention,
} from "./market-asset-retention.ts";

test("retention cutoff is exactly thirteen calendar months earlier", () => {
  assert.equal(
    retentionCutoff(new Date("2026-11-22T03:30:00.000Z")).toISOString(),
    "2025-10-22T03:30:00.000Z",
  );
});

test("retention runs one minute-only delete and returns its count", async () => {
  const cutoffs: Date[] = [];
  const result = await runMarketAssetRetention({
    now: () => new Date("2026-11-22T03:30:00.000Z"),
    deleteBefore: async (cutoff) => {
      cutoffs.push(cutoff);
      return 12;
    },
  });
  assert.equal(result.deleted, 12);
  assert.deepEqual(cutoffs, [new Date("2025-10-22T03:30:00.000Z")]);
});
