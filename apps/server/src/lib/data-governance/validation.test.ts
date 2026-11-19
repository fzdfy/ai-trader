import assert from "node:assert/strict";
import test from "node:test";
import type { GovernanceAsset } from "./types.ts";
import { validateGovernanceAsset } from "./validation.ts";

const validAsset: GovernanceAsset = {
  key: "bar1d_raw",
  name: "原始日线",
  kind: "raw",
  domain: "market_raw",
  tier: "tier_0",
  responsibilities: {
    owner: { name: "Data Platform" },
    steward: { name: "Quant Research" },
    operator: { name: "Super Administrator", role: "super_admin" },
  },
  classification: "internal",
  retention: { mode: "permanent", note: "原始行情与 PIT 数据长期保留" },
  contract: {
    businessDefinition: "未复权日线 OHLCV",
    grain: "symbol + time",
    primaryKey: ["symbol", "time"],
    eventTimeField: "time",
    freshnessSlaHours: 96,
    allowedConsumers: ["backtest", "screening", "stock_analysis"],
  },
  sourceStandardRefs: ["a-stock-data"],
  lineage: {
    upstreamAssets: [],
    downstreamAssets: ["adj_factor", "bar1d_qfq"],
    jobTypes: ["kline-1d"],
  },
};

test("accepts a complete tier zero asset", () => {
  assert.deepEqual(validateGovernanceAsset(validAsset), []);
});

test("rejects missing responsibilities and duplicate lineage targets", () => {
  const errors = validateGovernanceAsset({
    ...validAsset,
    responsibilities: {
      ...validAsset.responsibilities,
      owner: { name: " " },
    },
    lineage: {
      ...validAsset.lineage,
      downstreamAssets: ["adj_factor", "adj_factor"],
    },
  });

  assert.match(errors.join("\n"), /owner/i);
  assert.match(errors.join("\n"), /duplicate lineage/i);
});

test("requires a complete contract for tier zero assets", () => {
  const errors = validateGovernanceAsset({
    ...validAsset,
    contract: { ...validAsset.contract, primaryKey: [] },
  });

  assert.match(errors.join("\n"), /Tier 0/);
});

test("rejects invalid duration retention and self lineage", () => {
  const errors = validateGovernanceAsset({
    ...validAsset,
    retention: { mode: "duration", durationDays: 0, note: "bad" },
    lineage: {
      ...validAsset.lineage,
      downstreamAssets: ["bar1d_raw"],
    },
  });

  assert.match(errors.join("\n"), /durationDays/);
  assert.match(errors.join("\n"), /self-reference/i);
});
