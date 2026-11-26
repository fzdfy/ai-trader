import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  GROWTH_DEFENSE_INDEX_SYMBOLS,
  MAIN_INDEX_SYMBOLS,
  ROTATION_INDEX_SYMBOLS,
  rotationIndexDailyBar,
} from "./schema/market-rotation.ts";

const primaryKeyColumns = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).primaryKeys[0]?.columns.map((column) => column.name) ?? [];

test("rotation catalog keeps the growth pair and seven main indices", () => {
  assert.deepEqual(GROWTH_DEFENSE_INDEX_SYMBOLS, ["399673.SZ", "930955.CSI"]);
  assert.deepEqual(MAIN_INDEX_SYMBOLS, [
    "000001.SH",
    "000300.SH",
    "000905.SH",
    "000852.SH",
    "399673.SZ",
    "000688.SH",
    "930955.CSI",
  ]);
  assert.deepEqual(ROTATION_INDEX_SYMBOLS, MAIN_INDEX_SYMBOLS);
});

test("rotation daily table is independent from stock and backtest tables", () => {
  const config = getTableConfig(rotationIndexDailyBar);
  assert.equal(config.name, "rotation_index_daily_bar");
  assert.deepEqual(primaryKeyColumns(rotationIndexDailyBar), [
    "symbol",
    "trade_date",
  ]);
  assert.ok(!config.columns.some((column) => column.name === "adj_factor"));
  assert.ok(!config.columns.some((column) => column.name === "known_at"));
});

test("rotation daily table keeps source and observation evidence", () => {
  const config = getTableConfig(rotationIndexDailyBar);
  const names = config.columns.map((column) => column.name);
  assert.ok(names.includes("source"));
  assert.ok(names.includes("observed_at"));
  assert.ok(config.indexes.some(
    (index) => index.config.name === "rotation_index_daily_symbol_date_idx",
  ));
});
