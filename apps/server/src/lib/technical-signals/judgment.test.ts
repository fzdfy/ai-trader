import assert from "node:assert/strict";
import test from "node:test";

import type {
  SignalDirection,
  SignalLayerName,
  SignalQuality,
  SignalResult,
  SignalStatus,
} from "../../../../../packages/signal-catalog/src/contracts.ts";
import { buildSignalJudgmentSummary } from "./judgment.ts";

const signal = ({
  layer,
  status,
  direction,
  quality = "available",
  index,
}: {
  layer: SignalLayerName;
  status: SignalStatus;
  direction: SignalDirection;
  quality?: SignalQuality;
  index: number;
}): SignalResult => ({
  signalId: `${layer}.stock.fixture_${index}`,
  displayName: `fixture ${index}`,
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
  quality,
  proxy: false,
  sampleCount: 320,
  asOf: "2026-11-25",
  computedAt: "2026-11-26T08:00:00.000Z",
  dataSources: ["fixture"],
  evidence: { components: [], notes: [], missingFields: [] },
  catalogVersion: "technical-signals-1.0.0",
  definitionHash: "a".repeat(64),
});

const layerSignals = (
  layer: SignalLayerName,
  specs: Array<[SignalStatus, SignalDirection, SignalQuality?]>,
): SignalResult[] =>
  specs.map(([status, direction, quality], index) =>
    signal({ layer, status, direction, quality, index }),
  );

test("uses core-layer consensus and keeps microstructure from overriding direction", () => {
  const summary = buildSignalJudgmentSummary({
    objectType: "stock",
    signals: [
      ...layerSignals("basic", [
        ["invalidated", "bearish"],
        ["invalidated", "bearish"],
        ["triggered", "bullish"],
        ["neutral", "neutral"],
      ]),
      ...layerSignals("pattern", [
        ["invalidated", "bearish"],
        ["invalidated", "bearish"],
        ["triggered", "bullish"],
        ["neutral", "neutral"],
      ]),
      ...layerSignals("advanced", [
        ["triggered", "bullish"],
        ["unavailable", "neutral"],
        ["unavailable", "neutral"],
        ["unavailable", "neutral"],
      ]),
      ...layerSignals("micro", [
        ["triggered", "bullish"],
        ["triggered", "bullish"],
        ["low-confidence", "bullish"],
        ["low-confidence", "bullish"],
      ]),
    ],
  });

  assert.equal(summary.summaryVersion, "signal-judgment-1.0.0");
  assert.equal(summary.overall.verdict, "bearish");
  assert.equal(summary.overall.verdictLabel, "偏弱");
  assert.deepEqual(summary.overall.coreLayers, ["basic", "pattern"]);
  assert.ok(!summary.overall.coreLayers.some((layer) => String(layer) === "micro"));
});

test("excludes low-confidence, unavailable and not-applicable from direction votes", () => {
  const summary = buildSignalJudgmentSummary({
    objectType: "stock",
    signals: layerSignals("basic", [
      ["triggered", "bullish"],
      ["low-confidence", "bearish"],
      ["triggered", "bearish", "low"],
      ["unavailable", "bearish"],
      ["not-applicable", "bearish"],
      ["neutral", "neutral"],
      ["neutral", "neutral"],
      ["neutral", "neutral"],
      ["neutral", "neutral"],
      ["neutral", "neutral"],
    ]),
  });

  const basic = summary.layers.find((layer) => layer.layer === "basic");
  assert.equal(basic?.counts.bullish, 1);
  assert.equal(basic?.counts.bearish, 0);
  assert.equal(basic?.counts.lowConfidence, 2);
  assert.equal(basic?.counts.unavailable, 1);
  assert.equal(basic?.counts.notApplicable, 1);
  assert.equal(basic?.verdict, "bullish");
});

test("reports insufficient evidence without inventing a direction", () => {
  const summary = buildSignalJudgmentSummary({
    objectType: "gold",
    signals: [
      ...layerSignals("basic", [
        ["unavailable", "neutral"],
        ["not-applicable", "neutral"],
      ]),
      ...layerSignals("pattern", [["unavailable", "neutral"]]),
      ...layerSignals("advanced", [["unavailable", "neutral"]]),
    ],
  });

  assert.equal(summary.overall.verdict, "insufficient");
  assert.equal(summary.overall.verdictLabel, "证据不足");
  assert.deepEqual(summary.overall.coreLayers, []);
});

test("uses mixed when usable evidence conflicts before reaching full coverage", () => {
  const summary = buildSignalJudgmentSummary({
    objectType: "stock",
    signals: layerSignals("advanced", [
      ["triggered", "bullish"],
      ["invalidated", "bearish"],
      ["neutral", "neutral"],
      ["neutral", "neutral"],
      ["neutral", "neutral"],
      ["unavailable", "neutral"],
      ["unavailable", "neutral"],
      ["unavailable", "neutral"],
      ["unavailable", "neutral"],
      ["unavailable", "neutral"],
    ]),
  });

  const advanced = summary.layers.find((layer) => layer.layer === "advanced");
  assert.equal(advanced?.verdict, "mixed");
  assert.equal(advanced?.verdictLabel, "分歧");
});

test("produces the same summary for the same signal set", () => {
  const signals = layerSignals("basic", [
    ["triggered", "bullish"],
    ["invalidated", "bearish"],
    ["neutral", "neutral"],
  ]);
  assert.deepEqual(
    buildSignalJudgmentSummary({ objectType: "stock", signals }),
    buildSignalJudgmentSummary({ objectType: "stock", signals }),
  );
});
