import assert from "node:assert/strict";
import test from "node:test";
import {
  boardDetailPath,
  buildLimitUpConcentration,
  formatExcessReturn,
  formatMoney,
  formatRankChange,
  formatRotationValue,
  heatmapColorLevel,
  heatmapGridSpan,
  legacyMarketRedirect,
  MARKET_CAP_HEATMAP_LIMIT,
  MARKET_PAGE_SIZE,
  marketBreadthNarrative,
  mainIndexSampleLabel,
  marketRotationRequestPath,
  marketCenterTabForPath,
  paginateRows,
  paginationTokens,
  selectRotationQuadrantRows,
  selectMarketCapHeatmapRows,
  sealRate,
  splitMainIndices,
} from "./market-center.ts";
import type { MarketRotationRow } from "./market-center.ts";

test("market center exposes three stable tabs", () => {
  assert.equal(marketCenterTabForPath("/home/market"), "overview");
  assert.equal(marketCenterTabForPath("/home/market/boards/BK1036"), "boards");
  assert.equal(marketCenterTabForPath("/home/market/stock/002594.SZ"), "stocks");
});

test("rotation formatting keeps missing values explicit", () => {
  assert.equal(formatRotationValue(null), "—");
  assert.equal(formatRotationValue(2.34), "+2.3%");
  assert.equal(formatMoney(null), "—");
  assert.equal(formatMoney(680_000_000), "+6.8 亿");
  assert.equal(formatRankChange(8), "+8");
  assert.equal(formatRankChange(-9), "-9");
  assert.equal(formatRankChange(null), "—");
});

test("rotation quadrants expose at most three rows in source rank order", () => {
  const row = (
    code: string,
    phase: MarketRotationRow["phase"],
  ): MarketRotationRow => ({
    code,
    name: code,
    relativeReturn: 1,
    rank: 1,
    rankChange: 1,
    moneyConfirmation: null,
    limitUpConcentration: null,
    phase,
    quality: "available",
  });
  const rows = [
    row("突破一", "扩散"),
    row("加速一", "加速"),
    row("加速二", "加速"),
    row("加速三", "加速"),
    row("加速四", "加速"),
    row("扩散一", "扩散"),
    row("扩散二", "扩散"),
    row("扩散三", "扩散"),
  ];

  assert.deepEqual(
    selectRotationQuadrantRows(rows, ["加速"]).map((item) => item.code),
    ["加速一", "加速二", "加速三"],
  );
  assert.deepEqual(
    selectRotationQuadrantRows(rows, ["扩散", "放缓"]).map((item) => item.code),
    ["突破一", "扩散一", "扩散二"],
  );
});

test("board detail path preserves the board type", () => {
  assert.equal(boardDetailPath("BK1036", "industry"), "/home/market/boards/BK1036?type=industry");
});

test("legacy heatmap and fund flow links preserve board category", () => {
  assert.deepEqual(
    legacyMarketRedirect("/home/signals/heatmap", { tab: "concept" }),
    { to: "/home/market/boards", search: { type: "concept" } },
  );
  assert.deepEqual(
    legacyMarketRedirect("/home/signals/fundflow", { category: "industry" }),
    { to: "/home/market/boards", search: { type: "industry" } },
  );
  assert.equal(legacyMarketRedirect("/home/market", {}), null);
});

test("main index presentation keeps the Shanghai benchmark before six styles", () => {
  const item = (
    code: string,
    name: string,
    isBenchmark = false,
  ) => ({
    code,
    name,
    role: isBenchmark ? "市场基准" : "风格",
    isBenchmark,
    price: null,
    changePct: null,
    priceUnit: "点",
    asOf: null,
    source: "none",
    quality: "missing" as const,
    staleReason: null,
    trend: [],
  });
  const result = splitMainIndices([
    item("000688.SH", "科创50"),
    item("000001.SH", "上证指数", true),
    item("000300.SH", "沪深300"),
  ]);

  assert.equal(result.benchmark?.code, "000001.SH");
  assert.deepEqual(result.styles.map((entry) => entry.code), [
    "000300.SH",
    "000688.SH",
  ]);
});

test("main index relative values use percentage points and explicit sample labels", () => {
  assert.equal(formatExcessReturn(1.54), "+1.54pct");
  assert.equal(formatExcessReturn(null), "—");
  assert.equal(mainIndexSampleLabel("available", 6), "6 项完整");
  assert.equal(mainIndexSampleLabel("low", 3), "样本不足 · 3 项可用");
  assert.equal(
    marketRotationRequestPath("main-benchmark", "20D"),
    "/api/v1/market-center/rotation?scope=main-benchmark&window=20D",
  );
});

test("market breadth narrative combines industry breadth with the current style lead", () => {
  assert.equal(
    marketBreadthNarrative({
      industry: { total: 496, rising: 445, falling: 51 },
      growthRelative20d: 1.8,
      growthState: "中间区",
    }),
    "行业广度偏强，成长风格继续领先",
  );
  assert.equal(
    marketBreadthNarrative({
      industry: { total: 496, rising: 191, falling: 304 },
      growthRelative20d: -14.5,
      growthState: "中间区",
    }),
    "行业广度偏弱，防守风格继续领先",
  );
});

test("limit-up concentration groups leaders by industry and uses the limit-up total", () => {
  assert.deepEqual(
    buildLimitUpConcentration([
      { industry: "汽车零部", count: 3 },
      { industry: "元件", count: 4 },
      { industry: "汽车零部", count: 2 },
      { industry: null, count: 1 },
    ], 54),
    [
      { industry: "汽车零部", count: 5, percent: 9.3 },
      { industry: "元件", count: 4, percent: 7.4 },
    ],
  );
});

test("seal rate distinguishes sealed and opened limit-up samples", () => {
  assert.equal(sealRate(65, 26), 71.4);
  assert.equal(sealRate(54, 25), 68.4);
  assert.equal(sealRate(0, 0), null);
});

test("market tables paginate ten rows and clamp an out-of-range page", () => {
  const rows = Array.from({ length: 25 }, (_, index) => index + 1);

  assert.equal(MARKET_PAGE_SIZE, 10);
  assert.deepEqual(paginateRows(rows, 3), {
    rows: [21, 22, 23, 24, 25],
    page: 3,
    totalPages: 3,
    rangeStart: 21,
    rangeEnd: 25,
  });
  assert.deepEqual(paginateRows(rows, 99).rows, [21, 22, 23, 24, 25]);
  assert.deepEqual(paginateRows([], 1), {
    rows: [],
    page: 1,
    totalPages: 1,
    rangeStart: 0,
    rangeEnd: 0,
  });
});

test("pagination tokens preserve first, last and nearby pages", () => {
  assert.deepEqual(paginationTokens(1, 10), [
    1,
    2,
    "ellipsis-right",
    10,
  ]);
  assert.deepEqual(paginationTokens(5, 10), [
    1,
    "ellipsis-left",
    4,
    5,
    6,
    "ellipsis-right",
    10,
  ]);
  assert.deepEqual(paginationTokens(10, 10), [
    1,
    "ellipsis-left",
    9,
    10,
  ]);
});

test("market-cap heatmap selection keeps the largest unique boards", () => {
  const rows = [
    { code: "BK1", name: "银行", marketCap: 900, changePercent: -1 },
    { code: "BK2", name: "银行Ⅱ", marketCap: 900, changePercent: -1 },
    { code: "BK3", name: "电子", marketCap: 700, changePercent: 2 },
    { code: "BK4", name: "通信", marketCap: 500, changePercent: 1 },
  ];

  assert.deepEqual(
    selectMarketCapHeatmapRows(rows, 3).map((row) => row.code),
    ["BK1", "BK3", "BK4"],
  );
  assert.equal(MARKET_CAP_HEATMAP_LIMIT, 20);
});

test("heatmap spans form a full varied aligned desktop grid", () => {
  const spans = Array.from({ length: 20 }, (_, index) => heatmapGridSpan(index));

  assert.deepEqual(spans[0], { columns: 2, rows: 2 });
  assert.deepEqual(spans[1], { columns: 1, rows: 2 });
  assert.deepEqual(spans[3], { columns: 2, rows: 1 });
  assert.deepEqual(spans[5], { columns: 1, rows: 2 });
  assert.equal(
    spans.reduce((cells, span) => cells + span.columns * span.rows, 0),
    28,
  );
});

test("heatmap colors use one-percent ranges centered on zero", () => {
  assert.equal(heatmapColorLevel(3), 4);
  assert.equal(heatmapColorLevel(2.9), 3);
  assert.equal(heatmapColorLevel(2), 3);
  assert.equal(heatmapColorLevel(1.9), 2);
  assert.equal(heatmapColorLevel(1.1), 2);
  assert.equal(heatmapColorLevel(0.1), 1);
  assert.equal(heatmapColorLevel(0), 0);
  assert.equal(heatmapColorLevel(-0.1), -1);
  assert.equal(heatmapColorLevel(-1), -2);
  assert.equal(heatmapColorLevel(-1.9), -2);
  assert.equal(heatmapColorLevel(-2), -3);
  assert.equal(heatmapColorLevel(-2.9), -3);
  assert.equal(heatmapColorLevel(-3), -4);
  assert.equal(heatmapColorLevel(null), "missing");
});
