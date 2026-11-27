import assert from "node:assert/strict";
import test from "node:test";

import type {
  SignalResult,
  TechnicalSignalJudgmentSummary,
} from "@ai-trader/signal-catalog/contracts";
import {
  SIGNAL_FILTERS,
  filterSignals,
  groupSignalsByLayer,
  judgmentConfidenceLabel,
  judgmentLayer,
  judgmentVerdictMeta,
  signalCounts,
  signalStatusMeta,
  signalValidationMeta,
} from "./signal-utils.ts";

const signal = (
  id: string,
  status: SignalResult["status"],
  direction: SignalResult["direction"] = "neutral",
): SignalResult => ({
  signalId: id,
  displayName: id,
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
  status,
  direction,
  value: 1,
  unit: "score",
  quality: status === "unavailable" ? "missing" : "available",
  proxy: false,
  sampleCount: 320,
  asOf: "2026-11-25",
  computedAt: "2026-11-26T08:00:00.000Z",
  dataSources: ["fixture"],
  evidence: { components: [], notes: [], missingFields: [] },
  catalogVersion: "technical-signals-1.0.0",
  definitionHash: "a".repeat(64),
});

const signals = [
  signal("basic.stock.a", "triggered", "bullish"),
  signal("basic.stock.b", "neutral"),
  signal("pattern.stock.c", "low-confidence"),
  signal("advanced.stock.d", "triggered", "risk"),
  signal("micro.stock.e", "unavailable"),
  signal("micro.stock.f", "not-applicable"),
];

test("status filters use explicit text labels and do not collapse missing into neutral", () => {
  assert.equal(signalStatusMeta("triggered").label, "已触发");
  assert.equal(signalStatusMeta("low-confidence").label, "低置信");
  assert.equal(signalStatusMeta("unavailable").label, "不可用");
  assert.equal(signalStatusMeta("not-applicable").label, "不适用");
  assert.notEqual(signalStatusMeta("unavailable").className, signalStatusMeta("neutral").className);
});

test("signal status colors do not reuse the red/green price-direction palette", () => {
  for (const status of ["triggered", "invalidated"] as const) {
    const meta = signalStatusMeta(status);
    assert.doesNotMatch(`${meta.className} ${meta.dotClassName}`, /app-success|destructive/);
  }
});

test("shared filters cover trigger, risk, low confidence and unavailable", () => {
  assert.deepEqual(
    SIGNAL_FILTERS.map((filter) => filter.value),
    ["all", "triggered", "risk", "low-confidence", "unavailable"],
  );
  assert.deepEqual(
    filterSignals(signals, "risk").map((item) => item.signalId),
    ["advanced.stock.d"],
  );
  assert.deepEqual(
    filterSignals(signals, "unavailable").map((item) => item.signalId),
    ["micro.stock.e"],
  );
});

test("counts preserve every status including not-applicable", () => {
  assert.deepEqual(signalCounts(signals), {
    triggered: 2,
    neutral: 1,
    invalidated: 0,
    "low-confidence": 1,
    unavailable: 1,
    "not-applicable": 1,
  });
});

test("groups layers in diagnostic order and omits empty stock micro for non-stock", () => {
  const groups = groupSignalsByLayer(signals, { includeMicro: false });
  assert.deepEqual(
    groups.map((group) => [group.key, group.signals.length]),
    [
      ["basic", 2],
      ["pattern", 1],
      ["advanced", 1],
    ],
  );
});

test("signals without validation evidence only expose pending validation", () => {
  assert.deepEqual(signalValidationMeta(null), {
    label: "待验证",
    winRate: null,
    detail: "尚未完成统一成本、持有期和样本外验证。",
  });
});

const judgment: TechnicalSignalJudgmentSummary = {
  summaryVersion: "signal-judgment-1.0.0",
  overall: {
    verdict: "bearish",
    verdictLabel: "偏弱",
    headline: "核心层偏弱，等待反向证据",
    rationale: "基础信号偏空、K 线形态中性",
    confidence: "medium",
    coreLayers: ["basic"],
  },
  layers: [
    {
      layer: "basic",
      label: "基础信号",
      verdict: "bearish",
      verdictLabel: "偏空",
      rationale: "4 多 / 3 空 / 3 中性",
      confidence: "medium",
      counts: {
        total: 10,
        bullish: 4,
        bearish: 3,
        neutral: 3,
        lowConfidence: 0,
        unavailable: 0,
        notApplicable: 0,
        usable: 10,
        coverage: 1,
      },
    },
  ],
  counts: {
    triggered: 1,
    neutral: 2,
    invalidated: 0,
    "low-confidence": 0,
    unavailable: 0,
    "not-applicable": 0,
  },
  keySignals: ["basic.stock.a"],
  coverage: 1,
};

test("selects the persisted layer judgment by stable layer key", () => {
  assert.equal(judgmentLayer(judgment, "basic")?.verdictLabel, "偏空");
  assert.equal(judgmentLayer(judgment, "pattern"), null);
});

test("judgment tones stay separate from the red/green price palette", () => {
  for (const verdict of ["bullish", "bearish", "neutral", "mixed", "insufficient"] as const) {
    const meta = judgmentVerdictMeta(verdict);
    assert.doesNotMatch(`${meta.className} ${meta.dotClassName}`, /chart-up|chart-down/);
  }
});

test("judgment confidence uses product language", () => {
  assert.equal(judgmentConfidenceLabel("high"), "高");
  assert.equal(judgmentConfidenceLabel("medium"), "中");
  assert.equal(judgmentConfidenceLabel("low"), "低");
  assert.equal(judgmentConfidenceLabel("insufficient"), "证据不足");
});
