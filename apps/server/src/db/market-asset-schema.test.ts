import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  marketAssetDailyBar,
  marketAssetMinuteBar,
  marketAssetQuote,
} from "./schema/market-assets.ts";

const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).columns.map((column) => column.name);

const primaryKeyColumns = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).primaryKeys[0]?.columns.map((column) => column.name) ?? [];

test("market asset schema uses independent table names", () => {
  assert.equal(getTableConfig(marketAssetQuote).name, "market_asset_quote");
  assert.equal(getTableConfig(marketAssetMinuteBar).name, "market_asset_minute_bar");
  assert.equal(getTableConfig(marketAssetDailyBar).name, "market_asset_daily_bar");
});

test("quote table keeps one latest row per fixed symbol", () => {
  const config = getTableConfig(marketAssetQuote);
  assert.deepEqual(primaryKeyColumns(marketAssetQuote), ["symbol"]);
  assert.equal(config.foreignKeys.length, 0);
  assert.ok(columnNames(marketAssetQuote).includes("quoted_at"));
  assert.ok(columnNames(marketAssetQuote).includes("observed_at"));
  assert.ok(columnNames(marketAssetQuote).includes("quality"));
  assert.ok(!columnNames(marketAssetQuote).includes("adjust"));
});

test("minute table uses symbol and timestamptz bucket key", () => {
  const config = getTableConfig(marketAssetMinuteBar);
  assert.deepEqual(primaryKeyColumns(marketAssetMinuteBar), [
    "symbol",
    "bucket_start",
  ]);
  assert.equal(config.foreignKeys.length, 0);
  const bucket = config.columns.find((column) => column.name === "bucket_start");
  assert.equal(bucket?.getSQLType(), "timestamp with time zone");
  assert.ok(columnNames(marketAssetMinuteBar).includes("session_date"));
  assert.ok(columnNames(marketAssetMinuteBar).includes("observed_at"));
  assert.ok(
    config.indexes.some((index) => index.config.name === "market_asset_minute_symbol_bucket_idx"),
  );
  assert.ok(
    config.indexes.some((index) => index.config.name === "market_asset_minute_session_idx"),
  );
});

test("daily table uses symbol and trade date key", () => {
  const config = getTableConfig(marketAssetDailyBar);
  assert.deepEqual(primaryKeyColumns(marketAssetDailyBar), ["symbol", "trade_date"]);
  assert.equal(config.foreignKeys.length, 0);
  assert.ok(columnNames(marketAssetDailyBar).includes("observed_at"));
  assert.ok(!columnNames(marketAssetDailyBar).includes("known_at"));
  assert.ok(!columnNames(marketAssetDailyBar).includes("adj_factor"));
});

test("market asset numeric columns preserve price and volume precision", () => {
  for (const table of [marketAssetQuote, marketAssetMinuteBar, marketAssetDailyBar]) {
    const config = getTableConfig(table);
    for (const name of ["open", "high", "low", "close", "price", "pre_close"]) {
      const column = config.columns.find((item) => item.name === name);
      if (!column) continue;
      assert.equal(column.getSQLType(), "numeric(20, 6)");
    }
    for (const name of ["volume", "amount"]) {
      const column = config.columns.find((item) => item.name === name);
      if (!column) continue;
      assert.equal(column.getSQLType(), "numeric(24, 4)");
    }
  }
});
