import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStockPage,
  parseStockListSearch,
  stockPageRange,
  toStockDetailSearch,
  toStockReturnSearch,
} from "./stock-list-state.ts";

test("stock list search defaults to the first full-market page", () => {
  assert.deepEqual(parseStockListSearch({}), {
    tab: "stock",
    page: 1,
    q: "",
  });
});

test("stock list search normalizes tab, page, and query", () => {
  assert.deepEqual(parseStockListSearch({ tab: "watchlist", page: "3", q: " 银行 " }), {
    tab: "watchlist",
    page: 3,
    q: "银行",
  });
  assert.deepEqual(parseStockListSearch({ tab: "bad", page: "bad", q: 42 }), {
    tab: "stock",
    page: 1,
    q: "",
  });
});

test("stock page normalization clamps invalid and out-of-range pages", () => {
  assert.equal(normalizeStockPage(99, 2), 2);
  assert.equal(normalizeStockPage(3, 0), 1);
  assert.equal(normalizeStockPage(0, 4), 1);
});

test("stock page ranges use inclusive bounds", () => {
  assert.deepEqual(stockPageRange(2, 10, 29), { rangeStart: 11, rangeEnd: 20 });
  assert.deepEqual(stockPageRange(1, 10, 29), { rangeStart: 1, rangeEnd: 10 });
  assert.deepEqual(stockPageRange(3, 9, 29), { rangeStart: 21, rangeEnd: 29 });
  assert.deepEqual(stockPageRange(1, 0, 0), { rangeStart: 0, rangeEnd: 0 });
});

test("stock detail context round-trips the list state", () => {
  const detail = toStockDetailSearch({ tab: "watchlist", page: 2, q: "银行" });
  assert.deepEqual(detail, {
    from: "market-stock",
    listTab: "watchlist",
    listPage: 2,
    listQ: "银行",
  });
  assert.deepEqual(toStockReturnSearch(detail), {
    tab: "watchlist",
    page: 2,
    q: "银行",
  });
});
