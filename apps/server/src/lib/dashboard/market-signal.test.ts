import assert from "node:assert/strict";
import test from "node:test";
import { computeMarketSignal, type MarketSignalInput } from "./market-signal.ts";

const strong: MarketSignalInput = {
  aShare: {
    price: 110,
    ma20: 100,
    close20Ago: 95,
    changePct: 2,
  },
  breadth: {
    risingIndustryRatio: 0.9,
    positiveFundFlowRatio: 0.8,
  },
  heat: {
    limitUpTotal: 100,
    maxBoard: 10,
    avgTurnover: 10,
  },
  confidence: {
    selectedQuote: true,
    aShareQuotes: true,
    trendCoverage: true,
    breadthHeat: true,
  },
  asOf: "2026-11-20T07:00:00.000Z",
};

test("strong evidence yields risk-on with deterministic factors", () => {
  const signal = computeMarketSignal(strong);
  assert.equal(signal.modelVersion, "dashboard-signal-v1");
  assert.equal(signal.stance, "risk_on");
  assert.equal(signal.quality, "available");
  assert.equal(signal.dataConfidence, 100);
  assert.deepEqual(
    signal.factors.map((factor) => factor.key),
    ["trend", "breadth", "heat"],
  );
  assert.match(signal.body, /趋势|广度|热度/);
});

test("one missing factor degrades confidence but not to missing", () => {
  const signal = computeMarketSignal({
    ...strong,
    aShare: { ...strong.aShare, ma20: null },
    confidence: { ...strong.confidence, trendCoverage: false },
  });
  assert.equal(signal.quality, "low");
  assert.equal(signal.dataConfidence, 75);
  assert.equal(signal.factors[0]?.score, null);
});

test("two missing factors force neutral and insufficient-evidence copy", () => {
  const signal = computeMarketSignal({
    ...strong,
    aShare: { ...strong.aShare, ma20: null },
    breadth: { risingIndustryRatio: null, positiveFundFlowRatio: null },
    confidence: {
      ...strong.confidence,
      trendCoverage: false,
      breadthHeat: false,
    },
  });
  assert.equal(signal.quality, "missing");
  assert.equal(signal.stance, "neutral");
  assert.equal(signal.dataConfidence, 50);
  assert.match(signal.headline, /证据不足/);
  assert.match(signal.body, /不把缺失数据解释为看空/);
});

test("extra ETF fields cannot change the A-share signal", () => {
  const base = computeMarketSignal(strong);
  const withEtf = computeMarketSignal({
    ...strong,
    etfPrice: 999,
    etfChangePct: 99,
  } as MarketSignalInput);
  assert.deepEqual(withEtf, base);
});
