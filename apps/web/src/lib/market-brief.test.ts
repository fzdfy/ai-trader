import assert from "node:assert/strict";
import test from "node:test";
import {
  canRenderMarketChart,
  formatMarketPrice,
  marketQualityLabel,
  nextMarketTab,
  shouldLoadMarketRadar,
} from "./market-brief.ts";

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
