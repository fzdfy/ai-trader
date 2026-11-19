import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResearchGateDecision,
  type ResearchGateInput,
} from "./quality-gate.ts";

const healthy = {
  consumer: "backtest" as const,
  mode: "enforce" as const,
  now: new Date("2026-11-19T10:00:00Z"),
  evidenceSlaHours: 4,
  results: [
    {
      assetKey: "bar1d_raw",
      tier: "tier_0" as const,
      status: "passed" as const,
      severity: "critical" as const,
      checkedAt: "2026-11-19T09:00:00Z",
    },
    {
      assetKey: "trading_calendar",
      tier: "tier_0" as const,
      status: "passed" as const,
      severity: "critical" as const,
      checkedAt: "2026-11-19T09:00:00Z",
    },
    {
      assetKey: "instrument",
      tier: "tier_0" as const,
      status: "passed" as const,
      severity: "critical" as const,
      checkedAt: "2026-11-19T09:00:00Z",
    },
    {
      assetKey: "adj_factor",
      tier: "tier_0" as const,
      status: "passed" as const,
      severity: "critical" as const,
      checkedAt: "2026-11-19T09:00:00Z",
    },
  ],
  incidents: [],
} satisfies ResearchGateInput;

test("critical tier zero failure blocks research", () => {
  const decision = buildResearchGateDecision({
    ...healthy,
    results: healthy.results.map((result) =>
      result.assetKey === "bar1d_raw"
        ? { ...result, status: "failed" }
        : result,
    ),
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.blockingAssetKeys[0], "bar1d_raw");
});

test("lower tier failures warn without blocking", () => {
  const decision = buildResearchGateDecision({
    ...healthy,
    consumer: "stock_analysis",
    results: [
      ...healthy.results,
      {
        assetKey: "quote_latest",
        tier: "tier_1",
        status: "failed",
        severity: "critical",
        checkedAt: "2026-11-19T09:00:00Z",
      },
    ],
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.warnings[0]?.assetKey, "quote_latest");
});

test("stale or missing evidence is not treated as healthy", () => {
  const stale = buildResearchGateDecision({
    ...healthy,
    results: healthy.results.map((result) =>
      result.assetKey === "bar1d_raw"
        ? { ...result, checkedAt: "2026-11-18T00:00:00Z" }
        : result,
    ),
  });
  assert.equal(stale.allowed, false);
  assert.match(stale.reasons.join("\n"), /stale/);

  const missing = buildResearchGateDecision({
    ...healthy,
    results: healthy.results.filter(
      (result) => result.assetKey !== "adj_factor",
    ),
  });
  assert.equal(missing.allowed, false);
  assert.ok(missing.blockingAssetKeys.includes("adj_factor"));
});

test("one missing rule blocks a tier zero asset", () => {
  const barRules = [
    "freshness.business_time.bar1d_raw",
    "completeness.required_columns.bar1d_raw",
    "uniqueness.primary_key.bar1d_raw",
    "validity.ohlcv.bar1d_raw",
    "coverage.active_symbols.bar1d_raw",
    "consistency.calendar_alignment.bar1d_raw",
    "pit.as_of_known_at.bar1d_raw",
  ];
  const decision = buildResearchGateDecision({
    ...healthy,
    results: healthy.results.map((result) =>
      result.assetKey === "bar1d_raw"
        ? { ...result, ruleId: barRules[0] }
        : result,
    ),
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.blockingAssetKeys.includes("bar1d_raw"));
});

test("warn mode records blockers without stopping work", () => {
  const decision = buildResearchGateDecision({
    ...healthy,
    mode: "warn",
    results: healthy.results.map((result) =>
      result.assetKey === "bar1d_raw"
        ? { ...result, status: "failed" }
        : result,
    ),
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.blockingAssetKeys[0], "bar1d_raw");
  assert.match(decision.warnings[0]?.reason ?? "", /critical_failure/);
});

test("off mode skips enforcement", () => {
  const decision = buildResearchGateDecision({
    ...healthy,
    mode: "off",
    results: healthy.results.filter((result) => result.assetKey !== "bar1d_raw"),
  });
  assert.equal(decision.allowed, true);
  assert.ok(decision.blockingAssetKeys.includes("bar1d_raw"));
});

test("tier two failures are recorded without blocking or warning", () => {
  const decision = buildResearchGateDecision({
    ...healthy,
    results: [
      ...healthy.results,
      {
        assetKey: "quote_snapshot",
        tier: "tier_2",
        status: "failed",
        severity: "critical",
        checkedAt: "2026-11-19T09:00:00Z",
      },
    ],
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.warnings.length, 0);
});

test("unresolved critical incidents block research", () => {
  const decision = buildResearchGateDecision({
    ...healthy,
    incidents: [
      {
        assetKey: "instrument",
        severity: "critical",
        status: "resolving",
      },
    ],
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.blockingAssetKeys.includes("instrument"));
});
