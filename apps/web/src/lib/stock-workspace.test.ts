import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStockWorkspaceSearch,
  parseStockWorkspaceMode,
  shouldLoadStockResearch,
  stockWorkspacePath,
  stockWorkspaceRedirect,
  stockWorkspaceSearch,
} from "./stock-workspace.ts";

test("stock workspace defaults omitted and unknown modes to quick", () => {
  assert.equal(parseStockWorkspaceMode(undefined), "quick");
  assert.equal(parseStockWorkspaceMode("quick"), "quick");
  assert.equal(parseStockWorkspaceMode("research"), "research");
  assert.equal(parseStockWorkspaceMode("deep"), "quick");
});

test("stock research module loads only in research mode", () => {
  assert.equal(shouldLoadStockResearch("quick"), false);
  assert.equal(shouldLoadStockResearch("research"), true);
});

test("stock workspace keeps source and period context when switching mode", () => {
  assert.deepEqual(
    stockWorkspaceSearch({
      mode: "research",
      tf: "1w",
      from: "screens",
      list: "002594.SZ,600519.SH",
      listTab: "stock",
      listPage: 2,
      listQ: "汽车",
    }),
    {
      mode: "research",
      tf: "1w",
      from: "screens",
      list: "002594.SZ,600519.SH",
      listTab: "stock",
      listPage: 2,
      listQ: "汽车",
    },
  );
});

test("stock workspace search validates mode, period, and list context", () => {
  assert.deepEqual(
    parseStockWorkspaceSearch({
      mode: "research",
      tf: "1w",
      from: "screens",
      list: "002594.SZ,600519.SH",
      listTab: "watchlist",
      listPage: "3",
      listQ: "汽车",
    }),
    {
      mode: "research",
      tf: "1w",
      from: "screens",
      list: "002594.SZ,600519.SH",
      listTab: "watchlist",
      listPage: 3,
      listQ: "汽车",
    },
  );
  assert.deepEqual(parseStockWorkspaceSearch({ mode: "deep", tf: "2h", listPage: "0" }), {
    mode: "quick",
    tf: "1d",
    from: undefined,
    list: undefined,
    listTab: undefined,
    listPage: undefined,
    listQ: undefined,
  });
});

test("stock workspace canonical path omits quick mode and encodes research context", () => {
  assert.equal(stockWorkspacePath("SZ002594"), "/home/market/stock/002594.SZ");
  assert.equal(
    stockWorkspacePath("002594.SZ", {
      mode: "research",
      tf: "1w",
      from: "screens",
      list: "002594.SZ,600519.SH",
      listTab: "stock",
      listPage: 2,
      listQ: "汽车",
    }),
    "/home/market/stock/002594.SZ?mode=research&tf=1w&from=screens&list=002594.SZ%2C600519.SH&listTab=stock&listPage=2&listQ=%E6%B1%BD%E8%BD%A6",
  );
});

test("legacy stock analysis detail redirects to research mode", () => {
  assert.equal(
    stockWorkspaceRedirect("002594.SZ", {
      tf: "1w",
      from: "screens",
      list: "002594.SZ,600519.SH",
      listTab: "stock",
      listPage: 2,
      listQ: "汽车",
    }),
    "/home/market/stock/002594.SZ?mode=research&tf=1w&from=screens&list=002594.SZ%2C600519.SH&listTab=stock&listPage=2&listQ=%E6%B1%BD%E8%BD%A6",
  );
});
