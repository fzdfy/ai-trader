import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMarketAdvancedModels,
  evaluateGoldAdvancedModels,
  evaluateSectorAdvancedModels,
  evaluateStockAdvancedModels,
} from "./advanced.ts";

const computedAt = "2026-11-26T08:00:00.000Z";

test("market models expose ten scoped definitions and honest missing states", () => {
  const signals = evaluateMarketAdvancedModels(
    {
      styleReturns: {
        growth: 0.05,
        value: 0.02,
        small: 0.04,
        large: 0.03,
        cyclical: 0.06,
        defensive: 0.01,
      },
      breadth: {
        advanceDeclineRatio: 0.62,
        aboveMa200Ratio: 0.57,
        breadthChange5: 0.03,
      },
      realizedVolatility: 0.018,
      volatilityPercentile: 0.45,
      assetReturns: {
        aShare: 0.03,
        gold: 0.02,
        overseas: 0.04,
        dollar: -0.01,
      },
      factorStyleReturns: [0.01, 0.02, 0.015, -0.005, 0.008, 0.012],
      amountChange20: 0.12,
      turnoverChange20: 0.08,
      concentrationTop100: 0.31,
    },
    {
      objectCode: "000001.SH",
      asOf: "2026-11-25",
      computedAt,
    },
  );
  assert.equal(signals.length, 10);
  assert.ok(signals.every((signal) => signal.signalId.startsWith("advanced.market.")));
  assert.equal(
    signals.find((signal) => signal.signalId.endsWith(".rates_valuation_cycle"))?.status,
    "unavailable",
  );
  assert.equal(
    signals.find((signal) => signal.signalId.endsWith(".economic_cycle_leading"))?.status,
    "unavailable",
  );
  assert.equal(
    signals.find((signal) => signal.signalId.endsWith(".hmm_market_regime"))?.status,
    "unavailable",
  );
  for (const signal of signals) {
    if (typeof signal.value === "number") assert.ok(Number.isFinite(signal.value));
  }
});

test("market models return a complete unavailable matrix without factor context", () => {
  const signals = evaluateMarketAdvancedModels(null, {
    objectCode: "000001.SH",
    asOf: "2026-11-25",
    computedAt,
  });
  assert.equal(signals.length, 10);
  assert.ok(signals.every((signal) => signal.status === "unavailable"));
});

test("sector models keep growth defensive as non-applicable and preserve subtype", () => {
  const signals = evaluateSectorAdvancedModels(
    {
      componentPositive: { d20: 0.65, d60: 0.58, d120: 0.54 },
      sectorReturn20: 0.06,
      benchmarkReturn20: 0.03,
      relativeStrengthPercentile60: 0.72,
      fundFlow: {
        mainNet: 120_000_000,
        persistenceDays: 3,
      },
      earningsCoverage: 0.72,
      earningsGrowth: 0.18,
      revisionScore: 0.4,
      valuationPercentile: 0.42,
      leaderResonance: true,
      crowdingPercentile: 0.63,
      factorCoverage: {
        momentum: 1,
        quality: 0.9,
        valuation: 0.85,
        volatility: 0.9,
        fundflow: 0.8,
      },
    },
    {
      objectCode: "BK0475",
      objectSubtype: "industry",
      asOf: "2026-11-25",
      computedAt,
    },
  );
  assert.equal(signals.length, 10);
  assert.ok(
    signals.every(
      (signal) =>
        signal.objectSubtype === "industry" && signal.signalId.startsWith("advanced.sector."),
    ),
  );
  assert.equal(
    signals.find((signal) => signal.signalId.endsWith(".growth_defensive_rotation"))?.status,
    "not-applicable",
  );
  assert.equal(
    signals.find((signal) => signal.signalId.endsWith(".supply_chain_cycle"))?.status,
    "unavailable",
  );
});

test("sector models return a complete unavailable matrix without factor context", () => {
  const signals = evaluateSectorAdvancedModels(null, {
    objectCode: "BK0475",
    objectSubtype: "industry",
    asOf: "2026-11-25",
    computedAt,
  });
  assert.equal(signals.length, 10);
  assert.ok(
    signals.every(
      (signal) => signal.status === "unavailable" || signal.status === "not-applicable",
    ),
  );
});

test("stock models expose partial factor coverage as low confidence", () => {
  const signals = evaluateStockAdvancedModels(
    {
      returns: { d20: 0.08, d60: 0.12, d120: 0.2 },
      benchmarkReturns: { d20: 0.03, d60: 0.05, d120: 0.09 },
      fundamentals: {
        marketCapPercentile: 0.6,
        pbPercentile: 0.4,
        roe: 0.18,
        assetGrowth: 0.12,
        grossMargin: 0.45,
        cashFlowGrowth: 0.15,
      },
      earningsRevision: null,
      accumulation: {
        obvSlope20: 0.2,
        priceVolumeCorrelation: 0.35,
      },
      volatility: {
        atrPercentile: 0.22,
        bollingerPercentile: 0.18,
      },
      chip: {
        holderChange90: -0.08,
        costSupportDistance: 0.04,
      },
      industryRelativeStrength20: 0.04,
      events: [],
      factorCoverage: {
        momentum: 1,
        quality: 0.75,
        valuation: 0.9,
        revision: 0,
        riskLiquidity: 0.8,
      },
    },
    {
      objectCode: "600519.SH",
      asOf: "2026-11-25",
      computedAt,
    },
  );
  assert.equal(signals.length, 10);
  assert.ok(signals.every((signal) => signal.signalId.startsWith("advanced.stock.")));
  assert.equal(
    signals.find((signal) => signal.signalId.endsWith(".earnings_revision"))?.status,
    "unavailable",
  );
  assert.equal(
    signals.find((signal) => signal.signalId.endsWith(".stock_multifactor_expected_return"))
      ?.status,
    "low-confidence",
  );
});

test("stock models return ten honest missing results when server factors are unavailable", () => {
  const signals = evaluateStockAdvancedModels(null, {
    objectCode: "600519.SH",
    asOf: "2026-11-25",
    computedAt,
  });
  assert.equal(signals.length, 10);
  assert.ok(signals.every((signal) => signal.status === "unavailable"));
  assert.ok(signals.every((signal) => signal.evidence.missingFields.length > 0));
});

test("gold models are catalogued with explicit data requirements and no fabricated values", () => {
  const signals = evaluateGoldAdvancedModels({
    objectCode: "XAUUSD",
    asOf: "2026-11-25",
    computedAt,
  });
  assert.equal(signals.length, 10);
  assert.ok(signals.every((signal) => signal.signalId.startsWith("advanced.gold.")));
  assert.ok(signals.every((signal) => signal.status === "unavailable"));
  assert.ok(signals.every((signal) => signal.value === null));
  assert.ok(signals.every((signal) => signal.evidence.missingFields.length > 0));
});
