import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNAL_RESULT_STATUSES,
  validateSignalResult,
  validateSignalSnapshot,
  validateTechnicalSignalJudgmentSummary,
  type SignalResult,
  type SignalSnapshot,
  type TechnicalSignalJudgmentSummary,
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

const layerCounts = (
  overrides: Partial<TechnicalSignalJudgmentSummary["layers"][number]["counts"]> = {},
) => ({
  total: 10,
  bullish: 0,
  bearish: 0,
  neutral: 10,
  lowConfidence: 0,
  unavailable: 0,
  notApplicable: 0,
  usable: 10,
  coverage: 1,
  ...overrides,
});

const judgmentSummary = (
  overrides: Partial<TechnicalSignalJudgmentSummary> = {},
): TechnicalSignalJudgmentSummary => ({
  summaryVersion: "signal-judgment-1.0.0",
  overall: {
    verdict: "neutral",
    verdictLabel: "中性",
    headline: "核心层中性，等待方向确认",
    rationale: "基础信号、K 线形态和高级模型均未形成方向。",
    confidence: "low",
    coreLayers: ["basic", "pattern", "advanced"],
  },
  layers: [
    {
      layer: "basic",
      label: "基础信号",
      verdict: "neutral",
      verdictLabel: "中性",
      rationale: "10 项中性",
      confidence: "low",
      counts: layerCounts(),
    },
    {
      layer: "pattern",
      label: "K 线形态",
      verdict: "neutral",
      verdictLabel: "中性",
      rationale: "10 项中性",
      confidence: "low",
      counts: layerCounts(),
    },
    {
      layer: "advanced",
      label: "高级模型",
      verdict: "neutral",
      verdictLabel: "中性",
      rationale: "10 项中性",
      confidence: "low",
      counts: layerCounts(),
    },
  ],
  counts: snapshot().counts,
  keySignals: [],
  coverage: 1,
  ...overrides,
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

test("accepts a versioned layered judgment summary", () => {
  const summary = validateTechnicalSignalJudgmentSummary(judgmentSummary());
  assert.equal(summary.summaryVersion, "signal-judgment-1.0.0");
  assert.equal(summary.layers.length, 3);
});

test("rejects unknown judgment versions", () => {
  assert.throws(
    () =>
      validateTechnicalSignalJudgmentSummary({
        ...judgmentSummary(),
        summaryVersion: "signal-judgment-0.9.0",
      }),
    /summaryVersion/i,
  );
});

test("rejects microstructure as a core voting layer", () => {
  assert.throws(
    () =>
      validateTechnicalSignalJudgmentSummary({
        ...judgmentSummary(),
        overall: {
          ...judgmentSummary().overall,
          coreLayers: ["basic", "pattern", "micro"],
        },
      }),
    /coreLayers/i,
  );
});

test("rejects inconsistent layer counts", () => {
  assert.throws(
    () =>
      validateTechnicalSignalJudgmentSummary({
        ...judgmentSummary(),
        layers: [
          {
            ...judgmentSummary().layers[0]!,
            counts: layerCounts({ total: 11 }),
          },
          ...judgmentSummary().layers.slice(1),
        ],
      }),
    /counts/i,
  );
});
