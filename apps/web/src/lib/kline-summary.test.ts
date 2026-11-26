import assert from "node:assert/strict";
import test from "node:test";
import type { KLineData } from "klinecharts";
import { summarizeKlineAt, summarizeLatestKline } from "./kline-summary.ts";

const bars: KLineData[] = Array.from({ length: 6 }, (_, index) => ({
  timestamp: Date.UTC(2026, 10, index + 1),
  open: index + 1,
  high: index + 2,
  low: index + 0.5,
  close: index + 1,
  volume: 1000 + index,
}));

test("latest K-line summary keeps the last bar and trailing moving averages", () => {
  const summary = summarizeLatestKline(bars);

  assert.equal(summary?.bar.close, 6);
  assert.equal(summary?.ma[5], 4);
  assert.equal(summary?.ma[10], null);
  assert.equal(summary?.ma[120], null);
});

test("latest K-line summary is unavailable without bars", () => {
  assert.equal(summarizeLatestKline([]), null);
});

test("K-line summary follows the hovered data index", () => {
  const summary = summarizeKlineAt(bars, 3);

  assert.equal(summary?.bar.close, 4);
  assert.equal(summary?.ma[5], null);
  assert.equal(summarizeKlineAt(bars, 99), null);
});
