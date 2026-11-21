import assert from "node:assert/strict";
import test from "node:test";
import {
  createMarketDataReader,
  type AnalysisBar,
  type LiveMarketQuote,
  type StoredMarketQuote,
} from "./market-data-read.ts";

const symbol = "002594.SZ";
const liveQuote: LiveMarketQuote = {
  symbol,
  name: "比亚迪",
  last: 100,
  volume: 1000,
  amount: 100_000,
  change: 1,
  changePct: 1.01,
  pe: 20,
  pb: 3,
  turnoverRate: 2,
  totalMarketCap: 1_000_000,
  status: "trading",
};
const storedQuote: StoredMarketQuote = {
  ...liveQuote,
  last: 98,
  asOf: new Date("2026-11-21T02:59:00.000Z"),
};
const bars: AnalysisBar[] = Array.from({ length: 80 }, (_, index) => ({
  time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  open: 90 + index,
  high: 91 + index,
  low: 89 + index,
  close: 90.5 + index,
  volume: 1000,
  amount: 100_000,
}));

test("prefers a live quote and does not read the database", async () => {
  let storedReads = 0;
  const reader = createMarketDataReader({
    now: () => new Date("2026-11-21T03:00:00.000Z"),
    readLiveQuote: async () => liveQuote,
    readStoredQuote: async () => {
      storedReads += 1;
      return storedQuote;
    },
    readLiveBars: async () => bars,
    readStoredBars: async () => bars,
  });

  const result = await reader.readQuote(symbol);

  assert.equal(storedReads, 0);
  assert.equal(result.source, "quant-live");
  assert.equal(result.quality, "available");
  assert.equal(result.fallback, false);
  assert.equal(result.asOf, "2026-11-21T03:00:00.000Z");
  assert.equal(result.quote?.last, 100);
});

test("falls back to the stored quote when the live source fails", async () => {
  const reader = createMarketDataReader({
    now: () => new Date("2026-11-21T03:00:00.000Z"),
    readLiveQuote: async () => {
      throw new Error("upstream unavailable");
    },
    readStoredQuote: async () => storedQuote,
    readLiveBars: async () => bars,
    readStoredBars: async () => bars,
  });

  const result = await reader.readQuote(symbol);

  assert.equal(result.source, "quote_latest");
  assert.equal(result.quality, "available");
  assert.equal(result.fallback, true);
  assert.equal(result.asOf, "2026-11-21T02:59:00.000Z");
  assert.equal(result.quote?.last, 98);
});

test("marks a stale stored quote as low quality", async () => {
  const reader = createMarketDataReader({
    now: () => new Date("2026-11-30T03:00:00.000Z"),
    readLiveQuote: async () => {
      throw new Error("upstream unavailable");
    },
    readStoredQuote: async () => storedQuote,
    readLiveBars: async () => bars,
    readStoredBars: async () => bars,
  });

  const result = await reader.readQuote(symbol);

  assert.equal(result.source, "quote_latest");
  assert.equal(result.fallback, true);
  assert.equal(result.quality, "low");
  assert.equal(result.asOf, "2026-11-21T02:59:00.000Z");
});

test("prefers live K lines and falls back only when they are empty", async () => {
  let storedReads = 0;
  const reader = createMarketDataReader({
    readLiveQuote: async () => liveQuote,
    readStoredQuote: async () => storedQuote,
    readLiveBars: async () => bars,
    readStoredBars: async () => {
      storedReads += 1;
      return bars;
    },
  });

  const live = await reader.readDailyBars(symbol, 120);
  assert.equal(storedReads, 0);
  assert.equal(live.source, "quant-live-qfq");
  assert.equal(live.fallback, false);
  assert.equal(live.bars.length, 80);

  const fallbackReader = createMarketDataReader({
    readLiveQuote: async () => liveQuote,
    readStoredQuote: async () => storedQuote,
    readLiveBars: async () => [],
    readStoredBars: async () => bars,
  });
  const fallback = await fallbackReader.readDailyBars(symbol, 120);
  assert.equal(fallback.source, "bar1d_qfq");
  assert.equal(fallback.fallback, true);
});

test("returns missing quote and bars when both sources are unavailable", async () => {
  const reader = createMarketDataReader({
    readLiveQuote: async () => null,
    readStoredQuote: async () => null,
    readLiveBars: async () => [],
    readStoredBars: async () => [],
  });

  const quote = await reader.readQuote(symbol);
  const kline = await reader.readDailyBars(symbol, 120);

  assert.equal(quote.quality, "missing");
  assert.equal(quote.quote, null);
  assert.equal(kline.quality, "missing");
  assert.equal(kline.bars.length, 0);
});
