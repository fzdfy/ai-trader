import assert from "node:assert/strict";
import test from "node:test";

import { createTechnicalObjectAdapter, type TechnicalSeriesRead } from "./adapters.ts";

const series = (source: string): TechnicalSeriesRead => ({
  bars: Array.from({ length: 260 }, (_, index) => ({
    time: `2026-${String(1 + Math.floor(index / 28)).padStart(2, "0")}-${String(
      1 + (index % 28),
    ).padStart(2, "0")}`,
    open: 100 + index * 0.1,
    high: 100.5 + index * 0.1,
    low: 99.5 + index * 0.1,
    close: 100 + index * 0.1,
    volume: 1_000_000,
    amount: 100_000_000,
  })),
  asOf: "2026-11-25",
  source,
  quality: "available",
  hasVolume: true,
});

const adapter = createTechnicalObjectAdapter({
  readMarketIndex: async () => series("market_index"),
  readBenchmark: async () => series("market_benchmark"),
  readBoardKline: async (code, subtype) => series(`board_kline:${subtype}:${code}`),
  readStockHfqBars: async () => series("bar1d_hfq"),
  readGoldBars: async () => ({
    ...series("market_asset_daily_bar"),
    hasVolume: false,
    bars: series("gold").bars.map((bar) => ({ ...bar, volume: null })),
  }),
});

test("market adapters use Shanghai Composite as the technical base", async () => {
  const result = await adapter.read("market", "000001.SH", null, 320);
  assert.equal(result.identity.objectCode, "000001.SH");
  assert.equal(result.priceBasis, "shanghai_composite");
  assert.equal(result.dataSources[0], "market_index");
});

test("sector adapters require and preserve industry or concept subtype", async () => {
  await assert.rejects(adapter.read("sector", "BK0475", null, 320), /subtype/i);
  const industry = await adapter.read("sector", "BK0475", "industry", 320);
  const concept = await adapter.read("sector", "BK0475", "concept", 320);
  assert.equal(industry.identity.objectSubtype, "industry");
  assert.equal(concept.identity.objectSubtype, "concept");
  assert.equal(industry.benchmark?.bars.length, 260);
  assert.equal(industry.dataSources[0], "board_kline:industry:BK0475");
});

test("stock adapters use hfq as the sole computation basis", async () => {
  const result = await adapter.read("stock", "600519.SH", null, 320);
  assert.equal(result.priceBasis, "hfq");
  assert.equal(result.dataSources[0], "bar1d_hfq");
});

test("gold adapters preserve XAUUSD no-volume semantics", async () => {
  const result = await adapter.read("gold", "XAUUSD", null, 320);
  assert.equal(result.identity.objectCode, "XAUUSD");
  assert.equal(result.priceBasis, "usd_per_ounce");
  assert.equal(result.volumeApplicable, false);
  assert.ok(result.bars.every((bar) => bar.volume === null));
});

test("non-sector adapters reject a sector subtype", async () => {
  await assert.rejects(adapter.read("stock", "600519.SH", "industry", 320), /subtype/i);
});
