import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_ASSETS } from "../market-assets/catalog.ts";
import type { MarketAssetBarRead } from "../market-assets/reader.ts";
import { toMarketChart } from "./market-chart.ts";

const read: MarketAssetBarRead = {
  symbol: "510300.SH",
  name: "沪深300ETF",
  points: [
    { time: "2026-11-20T02:00:00Z", price: 4.02, open: 4, high: 4.03, low: 3.99, volume: 10 },
    { time: "2026-11-20T01:00:00Z", price: 4.01, open: 4, high: 4.02, low: 3.99, volume: 8 },
  ],
  sessionDate: "2026-11-20",
  hasVolume: true,
  quality: "available",
  staleReason: null,
};

test("chart builder sorts points and preserves ETF volume capability", () => {
  const chart = toMarketChart(read, MARKET_ASSETS["510300.SH"], "1D");
  assert.equal(chart.points[0]?.price, 4.01);
  assert.equal(chart.points[1]?.price, 4.02);
  assert.equal(chart.hasVolume, true);
});

test("missing chart does not become an empty success", () => {
  const chart = toMarketChart(
    { ...read, points: [], quality: "missing", staleReason: "no valid bars" },
    MARKET_ASSETS["510300.SH"],
    "1D",
  );
  assert.equal(chart.quality, "missing");
  assert.equal(chart.staleReason, "no valid bars");
});
