import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAnalysisMoney,
  mergeRecentAnalyses,
  normalizeCompareSymbols,
  stockAnalysisPath,
  stockComparePath,
} from "./stock-analysis.ts";

test("builds encoded analysis and compare routes", () => {
  assert.equal(stockAnalysisPath("002594.SZ"), "/home/market/analysis/002594.SZ");
  assert.equal(
    stockComparePath(["002594.SZ", "601633.SH", "601127.SH"]),
    "/home/market/analysis/compare?symbols=002594.SZ%2C601633.SH%2C601127.SH",
  );
});

test("normalizes and deduplicates compare symbols", () => {
  assert.deepEqual(
    normalizeCompareSymbols([" 002594.sz ", "002594.SZ", "sh600519", "AAPL", "920007"]),
    ["002594.SZ", "600519.SH", "920007.BJ"],
  );
});

test("formats analysis money without inventing missing values", () => {
  assert.equal(formatAnalysisMoney(null), "—");
  assert.equal(formatAnalysisMoney(723_176_000_000), "7,231.76 亿");
  assert.equal(formatAnalysisMoney(82_400_000), "8,240.00 万");
});

test("recent analyses keep the latest visit per symbol", () => {
  assert.deepEqual(
    mergeRecentAnalyses(
      [
        { symbol: "600519.SH", name: "贵州茅台", viewedAt: "2026-11-18T08:00:00.000Z" },
        { symbol: "002594.SZ", name: "比亚迪", viewedAt: "2026-11-17T08:00:00.000Z" },
      ],
      { symbol: "002594.SZ", name: "比亚迪", viewedAt: "2026-11-19T08:00:00.000Z" },
      2,
    ),
    [
      { symbol: "002594.SZ", name: "比亚迪", viewedAt: "2026-11-19T08:00:00.000Z" },
      { symbol: "600519.SH", name: "贵州茅台", viewedAt: "2026-11-18T08:00:00.000Z" },
    ],
  );
});
