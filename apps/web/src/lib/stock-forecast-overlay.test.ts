import assert from "node:assert/strict";
import test from "node:test";
import { buildStockForecastOverlay } from "./stock-forecast-overlay.ts";

test("forecast overlay produces one median path and one uncertainty band", () => {
  const overlay = buildStockForecastOverlay({
    current: 73.62,
    p10: 71.8,
    p50: 73.5,
    p90: 75.1,
    startTimestamp: Date.parse("2026-11-26T00:00:00+08:00"),
    sessions: 5,
  });

  assert.ok(overlay);
  assert.equal(overlay.points.length, 6);
  assert.equal(overlay.points[0]?.p10, 73.62);
  assert.equal(overlay.points[0]?.p50, 73.62);
  assert.equal(overlay.points[0]?.p90, 73.62);
  assert.equal(overlay.points.at(-1)?.p10, 71.8);
  assert.equal(overlay.points.at(-1)?.p50, 73.5);
  assert.equal(overlay.points.at(-1)?.p90, 75.1);
  assert.ok(overlay.points.every((point) => point.p10 <= point.p50 && point.p50 <= point.p90));
  assert.equal(new Set(overlay.points.map((point) => point.timestamp)).size, 6);
});

test("forecast overlay never invents a path when quantiles are missing", () => {
  assert.equal(
    buildStockForecastOverlay({
      current: 73.62,
      p10: null,
      p50: null,
      p90: null,
      startTimestamp: Date.parse("2026-11-26T00:00:00+08:00"),
    }),
    null,
  );
});
