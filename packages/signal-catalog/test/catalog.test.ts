import assert from "node:assert/strict";
import test from "node:test";

import { CATALOG_VERSION, SIGNAL_SCOPES, getSignalsByLayer, signals } from "../src/index.ts";

const EXPECTED_LAYER_COUNTS = {
  basic: 40,
  pattern: 48,
  advanced: 40,
  micro: 12,
} as const;

const EXPECTED_SCOPE_COUNTS = {
  market: 32,
  sector: 32,
  stock: 44,
  gold: 32,
} as const;

test("catalog expands to the approved version and 140 signals", () => {
  assert.equal(CATALOG_VERSION, "technical-signals-1.0.0");
  assert.equal(signals.length, 140);
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(EXPECTED_LAYER_COUNTS).map((layer) => [
        layer,
        getSignalsByLayer(layer as keyof typeof EXPECTED_LAYER_COUNTS).length,
      ]),
    ),
    EXPECTED_LAYER_COUNTS,
  );

  for (const scope of SIGNAL_SCOPES) {
    assert.equal(
      signals.filter((signal) => signal.scope === scope).length,
      EXPECTED_SCOPE_COUNTS[scope],
      `${scope} signal count`,
    );
  }
});

test("catalog signal IDs are unique and match layer.scope.name", () => {
  const ids = signals.map((signal) => signal.signalId);
  assert.equal(new Set(ids).size, signals.length);

  for (const signal of signals) {
    assert.equal(signal.signalId, `${signal.layer}.${signal.scope}.${signal.name}`);
  }
});

test("catalog definitions carry their executable contract", () => {
  for (const signal of signals) {
    assert.ok(signal.displayName.length > 0, signal.signalId);
    assert.ok(signal.rule.length > 0, signal.signalId);
    assert.ok(signal.confirmation.length > 0, signal.signalId);
    assert.ok(signal.invalidation.length > 0, signal.signalId);
    assert.ok(Object.keys(signal.params).length > 0, signal.signalId);
    assert.ok(signal.dataRequirements.length > 0, signal.signalId);
    assert.equal(signal.definitionVersion, CATALOG_VERSION);
    assert.deepEqual(signal.objectTypes, [signal.scope]);
  }
});

test("only sector signals require industry or concept subtype", () => {
  for (const signal of signals) {
    assert.deepEqual(
      signal.objectSubtypes,
      signal.scope === "sector" ? ["concept", "industry"] : [],
      signal.signalId,
    );
  }
});

test("the shared catalogs keep the approved display order", () => {
  assert.deepEqual(
    getSignalsByLayer("basic")
      .filter((signal) => signal.scope === "market")
      .map((signal) => signal.name),
    [
      "price_vs_ma200",
      "ma200_slope_20",
      "macd_zero_axis",
      "macd_divergence",
      "rsi_state",
      "bollinger_regime",
      "rvol",
      "adx_di",
      "obv_trend",
      "atr_regime",
    ],
  );
  assert.deepEqual(
    getSignalsByLayer("pattern")
      .filter((signal) => signal.scope === "gold")
      .map((signal) => signal.name),
    [
      "range_accumulation",
      "volume_contraction_base",
      "golden_cross",
      "bullish_alignment",
      "base_breakout",
      "platform_breakout",
      "pullback_confirmation",
      "acceleration",
      "high_level_stall",
      "top_reversal",
      "death_cross",
      "bearish_breakdown",
    ],
  );
});
