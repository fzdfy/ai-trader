import assert from "node:assert/strict";
import test from "node:test";

import type { SignalResult } from "../../../../../packages/signal-catalog/src/contracts.ts";
import { buildStockTechnicalSignalModule } from "./stock-analysis.ts";

const signal = (signalId: string): SignalResult => ({
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
  scope: "stock",
  objectType: "stock",
  objectSubtype: null,
  objectCode: "600519.SH",
  status: "neutral",
  direction: "neutral",
  value: 1,
  unit: "score",
  quality: "available",
  proxy: false,
  sampleCount: 320,
  asOf: "2026-11-25",
  computedAt: "2026-11-26T08:00:00.000Z",
  dataSources: ["bar1d_hfq"],
  evidence: { components: [], notes: [], missingFields: [] },
  catalogVersion: "technical-signals-1.0.0",
  definitionHash: "a".repeat(64),
});

test("stock analyzer builds a 44-signal matrix from Quant plus server factors", async () => {
  const module = await buildStockTechnicalSignalModule({
    symbol: "600519.SH",
    hfqBars: [
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
    qfqBars: [
      {
        time: "2026-11-25",
        open: 80,
        high: 81,
        low: 79,
        close: 80,
        volume: 1000,
        amount: 80000,
      },
    ],
    computedAt: "2026-11-26T08:00:00.000Z",
    evaluateQuant: async ({ bars }) => ({
      catalogVersion: "technical-signals-1.0.0",
      asOf: "2026-11-25",
      inputHash: "b".repeat(64),
      technical: {
        asOf: "2026-11-25",
        close: bars[0]?.close ?? 0,
        ma5: 99,
        ma10: 98,
        ma20: 97,
        ma60: 90,
        rsi14: 55,
        atr14: 2,
        volatility20: 18,
        support20: 92,
        resistance60: 105,
        change20: 2,
        change60: 7,
        maxDrawdown60: -4,
      },
      signals: [
        ...Array.from({ length: 10 }, (_, index) => signal(`basic.stock.signal_${index}`)),
        ...Array.from({ length: 12 }, (_, index) => signal(`pattern.stock.signal_${index}`)),
        ...Array.from({ length: 12 }, (_, index) => signal(`micro.stock.signal_${index}`)),
      ],
      errors: [],
    }),
  });
  assert.equal(module.signals.length, 44);
  assert.equal(module.technical?.close, 80);
  assert.equal(module.technical?.ma20, 97);
  assert.equal(module.catalogVersion, "technical-signals-1.0.0");
});

test("missing Quant technical leaves technical null without hiding available signals", async () => {
  const module = await buildStockTechnicalSignalModule({
    symbol: "600519.SH",
    hfqBars: [],
    qfqBars: [
      {
        time: "2026-11-25",
        open: 80,
        high: 81,
        low: 79,
        close: 80,
        volume: 1000,
        amount: 80000,
      },
    ],
    computedAt: "2026-11-26T08:00:00.000Z",
    evaluateQuant: async () => ({
      catalogVersion: "technical-signals-1.0.0",
      asOf: "2026-11-25",
      inputHash: "c".repeat(64),
      technical: null,
      signals: [signal("basic.stock.rsi_state")],
      errors: [],
    }),
  });
  assert.equal(module.technical, null);
  assert.equal(module.signals.length, 11);
  assert.equal(module.quality, "low");
});
