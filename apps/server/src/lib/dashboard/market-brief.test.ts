import assert from "node:assert/strict";
import test from "node:test";
import type {
  MarketAssetBarRead,
  MarketAssetQuoteRead,
} from "../market-assets/reader.ts";
import { loadMarketBrief, type MarketBriefDependencies } from "./market-brief.ts";

const quote = (symbol: string, price: number): MarketAssetQuoteRead => ({
  symbol: symbol as MarketAssetQuoteRead["symbol"],
  name: symbol,
  price,
  preClose: price - 1,
  open: price - 2,
  high: price + 1,
  low: price - 3,
  changePct: 1,
  volume: null,
  amount: null,
  priceUnit: "点",
  asOf: "2026-11-20T07:00:00.000Z",
  source: "fixture",
  quality: "available",
  staleReason: null,
});

const bars = (symbol: string): MarketAssetBarRead => ({
  symbol: symbol as MarketAssetBarRead["symbol"],
  name: symbol,
  points: Array.from({ length: 25 }, (_, index) => ({
    time: new Date(Date.UTC(2026, 10, 20, 1, index)).toISOString(),
    price: 100 + index,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    volume: 10,
  })),
  sessionDate: "2026-11-20",
  hasVolume: symbol !== "XAUUSD" && symbol !== "IXIC",
  quality: "available",
  staleReason: null,
});

function dependencies(overrides: Partial<MarketBriefDependencies> = {}) {
  const ranges: Array<[string, string]> = [];
  const deps: MarketBriefDependencies = {
    now: () => new Date("2026-11-20T07:30:00.000Z"),
    readQuote: async (symbol) => quote(symbol, symbol === "XAUUSD" ? 4032 : 100),
    readBars: async (symbol, options) => {
      ranges.push([symbol, options.start.toISOString()]);
      return bars(symbol);
    },
    loadSnapshot: async () => ({
      breadth: { industry: { total: 10, rising: 8, falling: 2, flat: 0 } },
      fundFlow: {
        breadth: { industry: { total: 10, positive: 7 } },
      },
      limitUp: { total: 50, maxBoard: 5, avgTurnover: 8 },
    }),
    ...overrides,
  };
  return { deps, ranges };
}

test("loads all quotes and three independent chart ranges", async () => {
  const fixture = dependencies();
  const brief = await loadMarketBrief(
    {
      symbol: "000001.SH",
      range: "1D",
      etfSymbol: "588000.SH",
      etfRange: "5D",
      globalSymbol: "IXIC",
      globalRange: "YTD",
    },
    fixture.deps,
  );
  assert.equal(brief.tickers.length, 7);
  assert.equal(brief.aShareChart.symbol, "000001.SH");
  assert.equal(brief.etfChart.symbol, "588000.SH");
  assert.equal(brief.globalChart.symbol, "IXIC");
  assert.deepEqual(
    fixture.ranges.map(([symbol]) => symbol),
    ["000001.SH", "588000.SH", "IXIC"],
  );
  assert.equal(new Set(fixture.ranges.map(([, start]) => start)).size, 3);
});

test("minute charts query seven days and keep only the latest session", async () => {
  const requests: Array<{
    kind: "minute" | "daily";
    start: string;
    latestSessionOnly?: boolean;
  }> = [];
  const fixture = dependencies({
    readBars: async (symbol, options) => {
      requests.push({
        kind: options.kind,
        start: options.start.toISOString(),
        latestSessionOnly: options.latestSessionOnly,
      });
      return bars(symbol);
    },
  });
  await loadMarketBrief(
    {
      symbol: "000001.SH",
      range: "1D",
      etfSymbol: "510300.SH",
      etfRange: "1D",
      globalSymbol: "XAUUSD",
      globalRange: "1D",
    },
    fixture.deps,
  );

  assert.deepEqual(requests, [
    {
      kind: "minute",
      start: "2026-11-13T07:30:00.000Z",
      latestSessionOnly: true,
    },
    {
      kind: "minute",
      start: "2026-11-13T07:30:00.000Z",
      latestSessionOnly: true,
    },
    {
      kind: "minute",
      start: "2026-11-13T07:30:00.000Z",
      latestSessionOnly: true,
    },
  ]);
});

test("one missing asset remains missing without failing the response", async () => {
  const fixture = dependencies({
    readQuote: async (symbol) => {
      if (symbol === "XAUUSD") throw new Error("gold unavailable");
      return quote(symbol, 100);
    },
  });
  const brief = await loadMarketBrief(
    {
      symbol: "000001.SH",
      range: "1D",
      etfSymbol: "510300.SH",
      etfRange: "1D",
      globalSymbol: "XAUUSD",
      globalRange: "1D",
    },
    fixture.deps,
  );
  assert.equal(brief.tickers.find((item) => item.symbol === "XAUUSD")?.quality, "missing");
  assert.equal(brief.globalChart.quality, "available");
});

test("response contains no user task or workflow data", async () => {
  const fixture = dependencies();
  const brief = await loadMarketBrief(
    {
      symbol: "000001.SH",
      range: "1D",
      etfSymbol: "510300.SH",
      etfRange: "1D",
      globalSymbol: "XAUUSD",
      globalRange: "1D",
    },
    fixture.deps,
  );
  assert.equal("tasks" in brief, false);
  assert.equal("workflows" in brief, false);
  assert.equal("userId" in brief, false);
});

test("snapshot failure degrades SIGNAL without failing market charts", async () => {
  const fixture = dependencies({
    loadSnapshot: async () => {
      throw new Error("breadth unavailable");
    },
  });
  const brief = await loadMarketBrief(
    {
      symbol: "000001.SH",
      range: "1D",
      etfSymbol: "510300.SH",
      etfRange: "1D",
      globalSymbol: "XAUUSD",
      globalRange: "1D",
    },
    fixture.deps,
  );
  assert.equal(brief.aShareChart.quality, "available");
  assert.equal(brief.signal.quality, "missing");
  assert.equal(brief.signal.stance, "neutral");
});
