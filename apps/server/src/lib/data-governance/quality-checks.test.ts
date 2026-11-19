import assert from "node:assert/strict";
import test from "node:test";
import { executeQualityRule } from "./quality-checks.ts";
import { QUALITY_RULES } from "./quality-rules.ts";
import { getGovernanceAsset } from "./registry.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

test(
  "all executable quality checks run without SQL errors",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async () => {
    const now = new Date();
    for (const assetKey of ["bar1d_raw", "bar1d_hfq", "adj_factor"]) {
      const asset = getGovernanceAsset(assetKey);
      assert.ok(asset);
      for (const rule of QUALITY_RULES.filter(
        (candidate) => candidate.assetKey === assetKey,
      )) {
        const result = await executeQualityRule(rule, {
          asset,
          now,
          jobRunId: null,
          requestId: "quality-check-test",
        });
        assert.notEqual(
          result.status,
          "error",
          `${rule.id}: ${JSON.stringify(result.details)}`,
        );
      }
    }
  },
);
