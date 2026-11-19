import assert from "node:assert/strict";
import test from "node:test";
import { diffGovernanceAssets } from "./schema-drift.ts";

test("schema drift ignores yearly partition children", () => {
  assert.deepEqual(
    diffGovernanceAssets(
      ["bar1d_raw", "instrument"],
      [
        "bar1d_raw",
        "bar1d_raw_2026",
        "bar1d_raw_default",
        "instrument",
        "new_table",
      ],
    ),
    { missing: ["new_table"], extra: [] },
  );
});

test("schema drift reports stale registered assets", () => {
  assert.deepEqual(
    diffGovernanceAssets(["bar1d_raw", "removed_table"], ["bar1d_raw"]),
    { missing: [], extra: ["removed_table"] },
  );
});
