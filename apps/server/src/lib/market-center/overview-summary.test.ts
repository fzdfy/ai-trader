import assert from "node:assert/strict";
import test from "node:test";
import { buildOverviewSections } from "./overview-summary.ts";

test("builds breadth, limit-up and deterministic anomaly sections from dashboard data", () => {
  const result = buildOverviewSections({
    asOf: {
      boards: "2026-11-21",
      fundFlow: "2026-11-21",
      limitUp: "2026-11-21",
    },
    breadth: {
      industry: { total: 4, rising: 3, falling: 1, flat: 0 },
      concept: { total: 6, rising: 2, falling: 3, flat: 1 },
    },
    fundFlow: {
      industry: [
        {
          code: "BK001",
          name: "行业一",
          mainNetInflow: 1_200_000_000,
        },
        {
          code: "BK002",
          name: "行业二",
          mainNetInflow: -800_000_000,
        },
      ],
      concept: [
        {
          code: "BK101",
          name: "概念一",
          mainNetInflow: 500_000_000,
        },
      ],
    },
    limitUp: {
      total: 32,
      maxBoard: 5,
      maxSealAmount: 900_000_000,
      avgTurnover: 8.2,
      openedCount: 4,
      ladder: [],
      leaders: [
        { name: "甲", industry: "行业一", count: 3 },
        { name: "乙", industry: "行业一", count: 2 },
      ],
    },
  });

  assert.deepEqual(result.breadth.industry, {
    total: 4,
    rising: 3,
    falling: 1,
    flat: 0,
  });
  assert.equal(result.limitUp.total, 32);
  assert.equal(result.anomalies.items[0]?.category, "industry");
  assert.equal(result.anomalies.items[0]?.href, "/home/market/boards/BK001?type=industry");
  assert.equal(
    result.anomalies.items.some(
      (item) => item.category === "limit_up" && item.title.includes("行业一"),
    ),
    true,
  );
  assert.equal(
    result.anomalies.items.some((item) => item.ruleId === "concept-bottom-main-net-inflow"),
    false,
  );
});
