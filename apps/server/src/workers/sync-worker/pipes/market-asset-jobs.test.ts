import assert from "node:assert/strict";
import test from "node:test";
import type { MarketAssetBar, MarketAssetQuote } from "../../../lib/quant.ts";
import {
  runMarketAssetDailyJob,
  runMarketAssetMinuteJob,
  type MarketAssetJobDependencies,
} from "./market-asset-jobs.ts";

const symbols = [
  "000001.SH",
  "399006.SZ",
  "510300.SH",
  "588000.SH",
  "159992.SZ",
  "XAUUSD",
  "IXIC",
];

const quote = (symbol: string): MarketAssetQuote => ({
  symbol,
  price: 100,
  pre_close: 99,
  open: 99,
  high: 101,
  low: 98,
  change_pct: 1,
  volume: null,
  amount: null,
  quoted_at: "2026-11-20T10:00:00+08:00",
  source: "fixture",
  price_unit: "点",
});

const bar = (symbol: string): MarketAssetBar => ({
  symbol,
  session_date: "2026-11-20",
  bucket_start: "2026-11-20T10:00:00+08:00",
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  volume: null,
  amount: null,
  source: "fixture",
});

function dependencies(overrides: Partial<MarketAssetJobDependencies> = {}) {
  const minuteCalls: Array<[string, string]> = [];
  const dailyCalls: string[] = [];
  const quoteCalls: string[][] = [];
  const upserts = { quotes: 0, minute: 0, daily: 0 };
  const deps: MarketAssetJobDependencies = {
    now: () => new Date("2026-11-20T02:00:00.000Z"),
    isTradingDay: async () => true,
    fetchQuotes: async (requested) => {
      quoteCalls.push(requested);
      return Object.fromEntries(requested.map((symbol) => [symbol, quote(symbol)]));
    },
    fetchMinute: async (symbol, tf) => {
      minuteCalls.push([symbol, tf]);
      return [bar(symbol)];
    },
    fetchDaily: async (symbol) => {
      dailyCalls.push(symbol);
      return [bar(symbol)];
    },
    upsertQuotes: async (values) => {
      upserts.quotes += values.length;
      return values.length;
    },
    upsertMinute: async (values) => {
      upserts.minute += values.length;
      return values.length;
    },
    upsertDaily: async (values) => {
      upserts.daily += values.length;
      return values.length;
    },
    ...overrides,
  };
  return { deps, minuteCalls, dailyCalls, quoteCalls, upserts };
}

test("minute job queries A shares only during the A-share session", async () => {
  const fixture = dependencies();
  await runMarketAssetMinuteJob(fixture.deps);
  assert.deepEqual(
    fixture.minuteCalls.map(([symbol]) => symbol),
    ["000001.SH", "399006.SZ", "510300.SH", "588000.SH", "159992.SZ", "XAUUSD"],
  );
  assert.equal(fixture.dailyCalls.length, 0);
  assert.equal(fixture.quoteCalls[0]?.length, 7);
  assert.equal(fixture.upserts.quotes, 7);
  assert.equal(fixture.upserts.minute, 6);
});

test("minute job uses 5m for IXIC during the US session", async () => {
  const fixture = dependencies({
    now: () => new Date("2026-11-20T15:00:00.000Z"),
    isTradingDay: async () => false,
  });
  await runMarketAssetMinuteJob(fixture.deps);
  assert.deepEqual(fixture.minuteCalls, [
    ["XAUUSD", "1m"],
    ["IXIC", "5m"],
  ]);
});

test("one asset failure does not block minute upserts for other assets", async () => {
  const fixture = dependencies({
    fetchMinute: async (symbol, tf) => {
      if (symbol === "159992.SZ") throw new Error("ETF timeout");
      return [bar(symbol)];
    },
  });
  const result = await runMarketAssetMinuteJob(fixture.deps);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.symbol, "159992.SZ");
  assert.equal(fixture.upserts.minute, 5);
});

test("daily job fetches all fixed assets and never calls minute endpoints", async () => {
  const fixture = dependencies();
  await runMarketAssetDailyJob(fixture.deps);
  assert.deepEqual(fixture.dailyCalls, symbols);
  assert.equal(fixture.minuteCalls.length, 0);
  assert.equal(fixture.upserts.daily, 7);
});
