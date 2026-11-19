import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRiskReferenceRange,
  buildScenarioForecasts,
  buildValuationRange,
  calculateTechnicalSnapshot,
  normalizeStockSymbol,
} from "./stock-analysis-data.ts";

const bars = Array.from({ length: 180 }, (_, index) => {
  const close = 72 + index * 0.05 + Math.sin(index / 4) * 1.8;
  return {
    time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    open: close - 0.4,
    high: close + 0.9,
    low: close - 1.1,
    close,
    volume: 1_000_000 + index * 1_000,
    amount: 80_000_000 + index * 50_000,
  };
});

test("normalizes supported A-share symbols", () => {
  assert.equal(normalizeStockSymbol(" sz002594 "), "002594.SZ");
  assert.equal(normalizeStockSymbol("600519.sh"), "600519.SH");
  assert.equal(normalizeStockSymbol("920007"), "920007.BJ");
  assert.equal(normalizeStockSymbol("002594.SZ"), "002594.SZ");
  assert.equal(normalizeStockSymbol("AAPL"), null);
});

test("calculates a technical snapshot from daily bars", () => {
  const snapshot = calculateTechnicalSnapshot(bars);
  assert.ok(snapshot);
  assert.equal(snapshot.asOf, bars.at(-1)?.time);
  assert.ok(snapshot.ma20 > 0);
  assert.ok(snapshot.ma60 > 0);
  assert.ok(snapshot.rsi14 >= 0 && snapshot.rsi14 <= 100);
  assert.ok(snapshot.support20 <= bars.at(-1)!.close);
  assert.ok(snapshot.resistance60 >= bars.at(-1)!.close);
});

test("builds ordered probability scenarios for all required horizons", () => {
  const forecasts = buildScenarioForecasts(bars);
  assert.deepEqual(
    forecasts.map((item) => item.horizon),
    ["5D", "20D", "60D"],
  );
  for (const item of forecasts) {
    assert.ok(item.p10! <= item.p50!);
    assert.ok(item.p50! <= item.p90!);
    assert.ok(item.upProbability! >= 0 && item.upProbability! <= 1);
    assert.ok(item.sampleCount > 0);
    assert.ok(item.backtestHitRate! >= 0 && item.backtestHitRate! <= 1);
    assert.ok(item.backtestSampleCount > 0);
  }
});

test("keeps forecast unavailable when history is insufficient", () => {
  const forecasts = buildScenarioForecasts(bars.slice(-30));
  assert.ok(forecasts.every((item) => item.quality === "missing" && item.p50 === null));
});

test("combines only available ranges into a risk reference range", () => {
  const technical = calculateTechnicalSnapshot(bars)!;
  const [forecast] = buildScenarioForecasts(bars);
  const valuation = buildValuationRange(4, [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]);
  const range = buildRiskReferenceRange({
    current: bars.at(-1)!.close,
    technical,
    forecast,
    valuation,
  });
  assert.ok(range.technical);
  assert.ok(range.scenario);
  assert.ok(range.valuation);
  assert.ok(range.low! <= range.high!);
});

test("builds valuation range from consensus EPS and PE history", () => {
  const range = buildValuationRange(4, [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]);
  assert.ok(range);
  assert.ok(range.low! < range.high!);
  assert.ok(range.low! >= 40);
  assert.ok(range.high! <= 112);
  assert.equal(buildValuationRange(null, [10, 12]), null);
  assert.equal(buildValuationRange(4, []), null);
});
