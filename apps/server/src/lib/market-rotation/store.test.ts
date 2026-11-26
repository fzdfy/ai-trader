import assert from "node:assert/strict";
import test from "node:test";
import { dedupeRotationIndexBars } from "./store.ts";

test("rotation bars dedupe by symbol and trade date", () => {
  const first = {
    symbol: "930955.CSI" as const,
    tradeDate: "2026-11-23",
    open: 1,
    high: 2,
    low: 1,
    close: 2,
    volume: null,
    amount: null,
    source: "csindex",
  };
  const second = { ...first, close: 3, source: "fixture" };

  assert.deepEqual(dedupeRotationIndexBars([first, second]), [second]);
});

test("missing rotation bars are not replaced with zero rows", () => {
  assert.deepEqual(dedupeRotationIndexBars([]), []);
});

test("main index storage accepts all seven approved symbols", () => {
  const symbols = [
    "000001.SH",
    "000300.SH",
    "000905.SH",
    "000852.SH",
    "399673.SZ",
    "000688.SH",
    "930955.CSI",
  ] as const;
  const rows = symbols.map((symbol) => ({
    symbol,
    tradeDate: "2026-11-21",
    open: 1,
    high: 2,
    low: 1,
    close: 2,
    volume: null,
    amount: null,
    source: "fixture",
  }));

  assert.deepEqual(
    dedupeRotationIndexBars(rows).map((row) => row.symbol),
    symbols,
  );
});

test("main index storage still rejects unapproved symbols", () => {
  assert.throws(
    () => dedupeRotationIndexBars([{
      symbol: "399006.SZ" as never,
      tradeDate: "2026-11-21",
      open: 1,
      high: 2,
      low: 1,
      close: 2,
      volume: null,
      amount: null,
      source: "fixture",
    }]),
    /unknown rotation index/,
  );
});
