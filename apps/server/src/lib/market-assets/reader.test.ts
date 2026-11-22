import assert from "node:assert/strict";
import test from "node:test";
import {
  createMarketAssetReader,
  type MarketAssetReaderDependencies,
} from "./reader.ts";
import type {
  StoredMarketAssetBar,
  StoredMarketAssetQuote,
} from "./store.ts";

const quote = (symbol: string, observedAt: Date): StoredMarketAssetQuote => ({
  symbol,
  price: 4032,
  pre_close: 4036,
  open: 4035,
  high: 4040,
  low: 4020,
  change_pct: -0.1,
  volume: null,
  amount: null,
  quotedAt: observedAt,
  observedAt,
  source: "fixture",
  price_unit: "",
  quality: "available",
  staleReason: null,
  fallbackReason: null,
  raw: null,
});

const bar = (symbol: string, bucketStart: Date): StoredMarketAssetBar => ({
  symbol,
  sessionDate: "2026-11-20",
  bucketStart,
  open: 4030,
  high: 4035,
  low: 4025,
  close: 4032,
  volume: null,
  amount: null,
  source: "fixture",
  observedAt: bucketStart,
});

function dependencies(
  overrides: Partial<MarketAssetReaderDependencies> = {},
): MarketAssetReaderDependencies {
  return {
    now: () => new Date("2026-11-20T08:00:00.000Z"),
    readStoredQuote: async () => null,
    readStoredBars: async () => [],
    ...overrides,
  };
}

test("missing quote and bars stay missing instead of becoming zero", async () => {
  const reader = createMarketAssetReader(dependencies());
  const quoteRead = await reader.readQuote("XAUUSD");
  const barRead = await reader.readBars("XAUUSD", {
    kind: "minute",
    limit: 10,
  });
  assert.equal(quoteRead.quality, "missing");
  assert.equal(quoteRead.price, null);
  assert.equal(barRead.quality, "missing");
  assert.deepEqual(barRead.points, []);
});

test("quote read keeps catalog unit and marks stale observations low quality", async () => {
  const reader = createMarketAssetReader(
    dependencies({
      readStoredQuote: async () => quote(
        "XAUUSD",
        new Date("2026-11-20T06:00:00.000Z"),
      ),
    }),
  );
  const read = await reader.readQuote("XAUUSD");
  assert.equal(read.priceUnit, "USD/oz");
  assert.equal(read.quality, "low");
  assert.equal(read.asOf, "2026-11-20T06:00:00.000Z");
  assert.match(read.staleReason ?? "", /stale/);
});

test("bar read returns ascending points and asset volume capability", async () => {
  const reader = createMarketAssetReader(
    dependencies({
      readStoredBars: async () => [
        bar("510300.SH", new Date("2026-11-20T01:31:00.000Z")),
        bar("510300.SH", new Date("2026-11-20T01:30:00.000Z")),
      ],
    }),
  );
  const read = await reader.readBars("510300.SH", { kind: "minute", limit: 10 });
  assert.equal(read.hasVolume, true);
  assert.equal(read.quality, "available");
  assert.equal(read.points[0]?.time, "2026-11-20T01:30:00.000Z");
});

test("unknown asset is rejected before storage access", async () => {
  let reads = 0;
  const reader = createMarketAssetReader(
    dependencies({
      readStoredQuote: async () => {
        reads += 1;
        return null;
      },
    }),
  );
  await assert.rejects(reader.readQuote("SPX"), /unknown market asset/i);
  assert.equal(reads, 0);
});
