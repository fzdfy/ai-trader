import assert from "node:assert/strict";
import test from "node:test";

import type { SignalResult } from "@ai-trader/signal-catalog/contracts";
import {
  SIGNAL_FILTERS,
  filterSignals,
  groupSignalsByLayer,
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
