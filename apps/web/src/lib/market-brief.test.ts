import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAShareIndexOverview,
  canRenderMarketChart,
  formatChangePct,
  formatMarketPrice,
  marketQualityLabel,
  moveChartPoint,
  nextMarketTab,
  latestThreeWorkflowRuns,
  orderTodayWorkTasks,
  shouldLoadMarketRadar,
  type MarketTick,
} from "./market-brief.ts";

const marketTick = (
  symbol: MarketTick["symbol"],
  name: string,
  price: number,
): MarketTick => ({
  symbol,
  name,
  price,
  changePct: 1.23,
  priceUnit: "点",
  asOf: "2026-11-20T08:00:00.000Z",
  quality: "available",
  source: "fixture",
  staleReason: null,
});

test("A-share overview keeps the fixed index order", () => {
  const input = [
    marketTick("399006.SZ", "创业板指", 2212.13),
    marketTick("000001.SH", "上证指数", 3533.79),
  ];
  const overview = buildAShareIndexOverview(input);

  assert.deepEqual(
    overview.map((item) => [item.symbol, item.label, item.ticker?.price]),
    [
      ["000001.SH", "上证指数", 3533.79],
      ["399006.SZ", "创业板指", 2212.13],
    ],
  );
  assert.deepEqual(input.map((item) => item.symbol), ["399006.SZ", "000001.SH"]);
});

test("A-share overview keeps an unavailable slot when a ticker is missing", () => {
  const overview = buildAShareIndexOverview([
    marketTick("000001.SH", "上证指数", 3533.79),
  ]);

  assert.equal(overview.length, 2);
  assert.equal(overview[1]?.symbol, "399006.SZ");
  assert.equal(overview[1]?.ticker, null);
});

test("percentage changes use signed two-decimal formatting", () => {
  assert.equal(formatChangePct(-1.234), "-1.23%");
  assert.equal(formatChangePct(1.234), "+1.23%");
  assert.equal(formatChangePct(0), "0.00%");
  assert.equal(formatChangePct(null), "—");
});

test("chart keyboard navigation stays inside available points", () => {
  assert.equal(moveChartPoint(5, 0, "ArrowLeft"), 0);
  assert.equal(moveChartPoint(5, 4, "ArrowRight"), 4);
  assert.equal(moveChartPoint(5, 2, "Home"), 0);
  assert.equal(moveChartPoint(5, 2, "End"), 4);
  assert.equal(moveChartPoint(0, 0, "ArrowRight"), -1);
});

test("ETF arrow keys wrap and preserve symbol order", () => {
  const symbols = ["510300.SH", "588000.SH", "159992.SZ"] as const;
  assert.equal(nextMarketTab(symbols, "510300.SH", "ArrowLeft"), "159992.SZ");
  assert.equal(nextMarketTab(symbols, "159992.SZ", "ArrowRight"), "510300.SH");
  assert.equal(nextMarketTab(symbols, "588000.SH", "Home"), "510300.SH");
  assert.equal(nextMarketTab(symbols, "588000.SH", "End"), "159992.SZ");
});

test("price formatting keeps asset unit and missing marker", () => {
  assert.equal(formatMarketPrice(4.018, "元"), "4.02 元");
  assert.equal(formatMarketPrice(3533.79, "点"), "3,533.79 点");
  assert.equal(formatMarketPrice(null, "点"), "—");
});

test("unknown quality never renders as available", () => {
  assert.equal(marketQualityLabel("missing", null), "暂不可用");
  assert.equal(marketQualityLabel("low", "stale quote"), "数据陈旧");
  assert.equal(marketQualityLabel("available", null), "可用");
});

test("chart requires at least two points", () => {
  assert.equal(canRenderMarketChart({ points: [] }), false);
  assert.equal(
    canRenderMarketChart({ points: [{ time: "a", price: 1 }] }),
    false,
  );
  assert.equal(
    canRenderMarketChart({
      points: [
        { time: "a", price: 1 },
        { time: "b", price: 2 },
      ],
    }),
    true,
  );
});

test("market radar loads only when feature flag is explicitly true", () => {
  assert.equal(shouldLoadMarketRadar(undefined), false);
  assert.equal(shouldLoadMarketRadar({ dashboardMarketRadar: false }), false);
  assert.equal(shouldLoadMarketRadar({ dashboardMarketRadar: true }), true);
});

test("today work task ordering keeps input immutable", () => {
  const input = [
    { id: 1, dueTime: "14:30", sortOrder: 1 },
    { id: 2, dueTime: "09:20", sortOrder: 2 },
    { id: 3, dueTime: null, sortOrder: 0 },
  ];
  assert.deepEqual(orderTodayWorkTasks(input).map((item) => item.id), [2, 1, 3]);
  assert.deepEqual(input.map((item) => item.id), [1, 2, 3]);
});

test("workflow run ordering returns the latest three", () => {
  const input = [1, 2, 3, 4].map((id) => ({
    id,
    createdAt: `2026-11-20T0${id}:00:00.000Z`,
  }));
  assert.deepEqual(latestThreeWorkflowRuns(input).map((item) => item.id), [4, 3, 2]);
});
