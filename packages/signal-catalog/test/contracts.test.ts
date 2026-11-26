import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNAL_RESULT_STATUSES,
  validateSignalResult,
  validateSignalSnapshot,
  type SignalResult,
  type SignalSnapshot,
} from "../src/contracts.ts";

const result = (overrides: Partial<SignalResult> = {}): SignalResult => ({
  signalId: "basic.stock.price_vs_ma200",
  displayName: "价格相对 MA200",
  rule: "close / MA200 - 1",
  params: { ma_window: 200 },
  confirmation: "收盘高于 MA200",
  invalidation: "收盘跌破 MA200",
  dataRequirements: [
    {
      dataset: "daily_ohlcv",
      fields: ["close"],
      minHistory: 200,
      required: true,
      source: "fixture",
    },
  ],
  scope: "stock",
  objectType: "stock",
  objectSubtype: null,
  objectCode: "600519.SH",
  status: "triggered",
  direction: "bullish",
  value: 0.042,
  unit: "ratio",
  quality: "available",
  proxy: false,
  sampleCount: 260,
  asOf: "2026-11-25",
  computedAt: "2026-11-26T08:00:00.000Z",
  dataSources: ["bar1d_hfq"],
  evidence: {
    components: [
      {
        signalId: "basic.stock.price_vs_ma200",
        status: "triggered",
        value: 0.042,
      },
    ],
    notes: ["收盘价高于 MA200"],
    missingFields: [],
  },
  catalogVersion: "technical-signals-1.0.0",
  definitionHash: "a".repeat(64),
  ...overrides,
});

const snapshot = (signals: SignalResult[] = [result()]): SignalSnapshot => ({
  objectType: "stock",
  objectSubtype: null,
  objectCode: "600519.SH",
  asOf: "2026-11-25",
  computedAt: "2026-11-26T08:00:00.000Z",
  catalogVersion: "technical-signals-1.0.0",
  quality: "available",
  counts: Object.fromEntries(
    SIGNAL_RESULT_STATUSES.map((status) => [
      status,
      signals.filter((signal) => signal.status === status).length,
    ]),
  ) as SignalSnapshot["counts"],
  summarySignalIds: signals.map((signal) => signal.signalId),
  signals,
});

test("accepts a finite stock result and a consistent snapshot", () => {
  assert.equal(validateSignalResult(result()).signalId, result().signalId);
  assert.equal(validateSignalSnapshot(snapshot()).signals.length, 1);
});

test("rejects an unknown signal status", () => {
  assert.throws(
    () => validateSignalResult(result({ status: "buy" as SignalResult["status"] })),
    /status/i,
  );
});

test("rejects non-finite result and evidence numbers", () => {
  assert.throws(() => validateSignalResult(result({ value: Number.NaN })), /finite/i);
  assert.throws(
    () =>
      validateSignalResult(
        result({
          evidence: {
            components: [
              {
                signalId: "basic.stock.price_vs_ma200",
                status: "triggered",
                value: Number.POSITIVE_INFINITY,
              },
            ],
            notes: [],
            missingFields: [],
          },
        }),
      ),
    /finite/i,
  );
});

test("rejects duplicate result IDs in a snapshot", () => {
  const first = result();
  const duplicate = result({ direction: "neutral" });
  assert.throws(() => validateSignalSnapshot(snapshot([first, duplicate])), /duplicate/i);
});

test("sector results require an industry or concept subtype", () => {
  assert.throws(
    () =>
      validateSignalResult(
        result({
          signalId: "basic.sector.price_vs_ma200",
          scope: "sector",
          objectType: "sector",
          objectSubtype: null,
        }),
      ),
    /subtype/i,
  );
});

test("non-sector results reject a sector subtype", () => {
  assert.throws(() => validateSignalResult(result({ objectSubtype: "industry" })), /subtype/i);
});

test("snapshot summary IDs must reference its own results", () => {
  assert.throws(
    () =>
      validateSignalSnapshot({
        ...snapshot(),
        summarySignalIds: ["basic.stock.rsi_state"],
      }),
    /summary/i,
  );
});
