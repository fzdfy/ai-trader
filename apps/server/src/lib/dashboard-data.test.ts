import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeBreadth,
  summarizeFundFlowBreadth,
  summarizeLimitUp,
  toNumber,
} from "./dashboard-data.ts";

test("dashboard numbers accept numeric database strings", () => {
  assert.equal(toNumber("12.5"), 12.5);
  assert.equal(toNumber(8), 8);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber("bad"), null);
});

test("dashboard board breadth counts rising, falling, and flat rows", () => {
  assert.deepEqual(
    summarizeBreadth([
      { type: "industry", changePercent: "1.2" },
      { type: "industry", changePercent: "-0.5" },
      { type: "industry", changePercent: "0" },
      { type: "concept", changePercent: "3" },
    ]),
    {
      industry: { total: 3, rising: 1, falling: 1, flat: 1 },
      concept: { total: 1, rising: 1, falling: 0, flat: 0 },
    },
  );
});

test("dashboard limit-up summary derives temperature and ladder from the snapshot", () => {
  const summary = summarizeLimitUp([
    {
      name: "汉森制药",
      industry: "中药",
      limitUpCount: 5,
      isLimitUp: true,
      openCount: 0,
      sealAmount: "326130693",
      turnoverRate: "5",
    },
    {
      name: "楚天龙",
      industry: "通信设备",
      limitUpCount: 3,
      isLimitUp: true,
      openCount: 1,
      sealAmount: "160849088",
      turnoverRate: "10",
    },
    {
      name: "炸板样本",
      industry: "软件",
      limitUpCount: 1,
      isLimitUp: false,
      openCount: 2,
      sealAmount: "0",
      turnoverRate: "7",
    },
  ]);

  assert.equal(summary.total, 2);
  assert.equal(summary.maxBoard, 5);
  assert.equal(summary.maxSealAmount, 326130693);
  assert.equal(summary.avgTurnover.toFixed(2), "7.33");
  assert.equal(summary.openedCount, 2);
  assert.deepEqual(summary.ladder, [
    { count: 5, names: ["汉森制药"] },
    { count: 3, names: ["楚天龙"] },
  ]);
});

test("dashboard fund-flow breadth counts positive net inflow by category", () => {
  assert.deepEqual(
    summarizeFundFlowBreadth([
      { category: "industry", mainNetInflow: "10" },
      { category: "industry", mainNetInflow: "-2" },
      { category: "industry", mainNetInflow: "0" },
      { category: "concept", mainNetInflow: "3" },
    ]),
    {
      industry: { total: 3, positive: 1 },
      concept: { total: 1, positive: 1 },
    },
  );
});
