import assert from "node:assert/strict";
import test from "node:test";
import {
  initialMarketSelection,
  reduceMarketSelection,
} from "./market-selection.ts";

test("ETF keyboard changes only ETF selection", () => {
  const before = initialMarketSelection();
  const after = reduceMarketSelection(before, {
    type: "etf-key",
    key: "ArrowRight",
  });
  assert.equal(after.etfSymbol, "588000.SH");
  assert.equal(after.symbol, before.symbol);
  assert.equal(after.globalSymbol, before.globalSymbol);
});

test("A-share index changes only the selected index", () => {
  const before = initialMarketSelection();
  const after = reduceMarketSelection(before, {
    type: "index",
    symbol: "399006.SZ",
  });

  assert.deepEqual(after, {
    ...before,
    symbol: "399006.SZ",
  });
});

test("range changes stay isolated to their asset domain", () => {
  const before = initialMarketSelection();
  const after = reduceMarketSelection(before, {
    type: "range",
    domain: "global",
    range: "YTD",
  });
  assert.equal(after.globalRange, "YTD");
  assert.equal(after.range, before.range);
  assert.equal(after.etfRange, before.etfRange);
});

test("ETF Home and End follow visible symbol order", () => {
  const start = initialMarketSelection();
  const end = reduceMarketSelection(start, { type: "etf-key", key: "End" });
  assert.equal(end.etfSymbol, "159992.SZ");
  assert.equal(
    reduceMarketSelection(end, { type: "etf-key", key: "Home" }).etfSymbol,
    "510300.SH",
  );
});
