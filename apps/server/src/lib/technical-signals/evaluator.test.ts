import assert from "node:assert/strict";
import test from "node:test";

import type { SignalResult } from "../../../../../packages/signal-catalog/src/contracts.ts";
import {
  applyAssetConfirmation,
  evaluateObjectTechnicalSignals,
  type AssetConfirmation,
} from "./evaluator.ts";
import type { TechnicalObjectRead } from "./adapters.ts";

const signal = (signalId: string, status: SignalResult["status"] = "triggered"): SignalResult => ({
  signalId,
  displayName: signalId,
  rule: "fixture rule",
  params: { fixture: true },
  confirmation: "fixture confirmation",
  invalidation: "fixture invalidation",
  dataRequirements: [
    {
      dataset: "fixture",
      fields: ["close"],
      minHistory: 1,
      required: true,
      source: "fixture",
    },
  ],
  scope: signalId.split(".")[1] as SignalResult["scope"],
  objectType: signalId.split(".")[1] as SignalResult["objectType"],
  objectSubtype: null,
  objectCode: "000001.SH",
  status,
  direction: "bullish",
  value: 1,
  unit: "score",
  quality: status === "low-confidence" ? "low" : "available",
  proxy: false,
  sampleCount: 320,
  asOf: "2026-11-25",
  computedAt: "2026-11-26T08:00:00.000Z",
  dataSources: ["market_index"],
  evidence: { components: [], notes: [], missingFields: [] },
  catalogVersion: "technical-signals-1.0.0",
  definitionHash: "a".repeat(64),
});

const availableConfirmation: AssetConfirmation = {
  available: true,
  advanceDeclineRatio: 0.61,
  breadthChange5: 0.04,
  leaderResonance: true,
  source: "breadth_fixture",
};

test("market patterns without breadth evidence are downgraded", () => {
  const [pattern, basic] = applyAssetConfirmation(
    [signal("pattern.market.platform_breakout"), signal("basic.market.rsi_state", "neutral")],
    "market",
    {
      available: false,
      advanceDeclineRatio: null,
      breadthChange5: null,
      leaderResonance: null,
      source: "unavailable",
    },
  );
  assert.equal(pattern?.status, "low-confidence");
  assert.equal(pattern?.quality, "low");
  assert.match(pattern?.evidence.notes.join(" ") ?? "", /宽度/);
  assert.equal(basic?.status, "neutral");
});

test("market patterns retain confirmation when breadth agrees", () => {
  const [pattern] = applyAssetConfirmation(
    [signal("pattern.market.platform_breakout")],
    "market",
    availableConfirmation,
  );
  assert.equal(pattern?.status, "triggered");
  assert.equal(pattern?.quality, "available");
});

test("sector patterns require breadth or leader resonance", () => {
  const [pattern] = applyAssetConfirmation(
    [{ ...signal("pattern.sector.platform_breakout"), objectSubtype: "industry" }],
    "sector",
    {
      ...availableConfirmation,
      advanceDeclineRatio: 0.4,
      breadthChange5: -0.02,
    },
  );
  assert.equal(pattern?.status, "triggered");
  assert.match(pattern?.evidence.notes.join(" ") ?? "", /龙头/);
});

test("stock signals are not changed by market breadth", () => {
  const original = {
    ...signal("pattern.stock.platform_breakout"),
    objectCode: "600519.SH",
  };
  const [pattern] = applyAssetConfirmation([original], "stock", {
    available: false,
    advanceDeclineRatio: null,
    breadthChange5: null,
    leaderResonance: null,
    source: "unavailable",
  });
  assert.equal(pattern, original);
});

test("evaluator sends hfq bars to Quant and merges returned signals", async () => {
  const read: TechnicalObjectRead = {
    identity: {
      objectType: "stock",
      objectSubtype: null,
      objectCode: "600519.SH",
    },
    bars: [
      {
        time: "2026-11-25",
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1000,
        amount: 100000,
      },
    ],
    benchmark: null,
    priceBasis: "hfq",
    volumeApplicable: true,
    dataSources: ["bar1d_hfq"],
    quality: "available",
    asOf: "2026-11-25",
  };
  let receivedBars: unknown[] = [];
  const result = await evaluateObjectTechnicalSignals(read, {
    computedAt: "2026-11-26T08:00:00.000Z",
    evaluateQuant: async (input) => {
      receivedBars = input.bars;
      return {
        catalogVersion: "technical-signals-1.0.0",
        signals: [
          signal("basic.stock.rsi_state", "neutral"),
          signal("pattern.stock.platform_breakout"),
          signal("micro.stock.amihud", "unavailable"),
        ],
        technical: null,
        errors: [],
      };
    },
    readConfirmation: async () => ({
      available: false,
      advanceDeclineRatio: null,
      breadthChange5: null,
      leaderResonance: null,
      source: "unavailable",
    }),
  });
  assert.equal(receivedBars.length, 1);
  assert.equal(result.objectCode, "600519.SH");
  assert.equal(result.signals.length, 3);
  assert.equal(result.priceBasis, "hfq");
});
