import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeMarketAssetBars,
  ingestMarketAssetSymbols,
  type MarketAssetBarValue,
} from "./store.ts";

const bar = (
  symbol: string,
  bucketStart: string,
  close = 100,
): MarketAssetBarValue => ({
  symbol,
  sessionDate: "2026-11-20",
  bucketStart,
  open: close,
  high: close,
  low: close,
  close,
  volume: null,
  amount: null,
  source: "fixture",
});

test("dedupes repeated symbol and bucket before one upsert", () => {
  const values = dedupeMarketAssetBars([
    bar("000001.SH", "2026-11-20T09:30:00+08:00", 100),
    bar("000001.SH", "2026-11-20T09:30:00+08:00", 101),
    bar("000001.SH", "2026-11-20T09:31:00+08:00", 102),
  ]);
  assert.equal(values.length, 2);
  assert.equal(values[0]?.close, 101);
});

test("one asset failure does not block successful assets", async () => {
  const batches: MarketAssetBarValue[][] = [];
  const result = await ingestMarketAssetSymbols(
    ["000001.SH", "XAUUSD"],
    async (symbol) => {
      if (symbol === "XAUUSD") throw new Error("upstream timeout");
      return [bar(symbol, "2026-11-20T09:30:00+08:00")];
    },
    async (values) => {
      batches.push(values);
      return values.length;
    },
  );

  assert.equal(result.upserted, 1);
  assert.deepEqual(result.succeeded, ["000001.SH"]);
  assert.deepEqual(result.failed.map((item) => item.symbol), ["XAUUSD"]);
  assert.equal(batches.length, 1);
});

test("all asset failures reject instead of returning a fake success", async () => {
  await assert.rejects(
    ingestMarketAssetSymbols(
      ["XAUUSD", "IXIC"],
      async () => {
        throw new Error("upstream unavailable");
      },
      async () => 0,
    ),
    /all market assets failed/i,
  );
});

test("empty asset reads are skipped rather than sent as empty success batches", async () => {
  let upserts = 0;
  const result = await ingestMarketAssetSymbols(
    ["000001.SH"],
    async () => [],
    async () => {
      upserts += 1;
      return 0;
    },
  );
  assert.equal(upserts, 0);
  assert.equal(result.skipped, 1);
});
