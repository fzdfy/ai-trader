import assert from "node:assert/strict";
import test from "node:test";
import { buildBoardRotationSeries } from "./board-rotation.ts";

test("builds separate rotation series from board kline history", () => {
  const series = buildBoardRotationSeries(
    "industry",
    [
      { code: "BK001", type: "industry", name: "行业一" },
      { code: "BK002", type: "industry", name: "行业二" },
      { code: "BK003", type: "concept", name: "概念一" },
    ],
    [
      { code: "BK001", date: "2026-11-20", close: "100" },
      { code: "BK001", date: "2026-11-21", close: "102" },
      { code: "BK002", date: "2026-11-20", close: "100" },
      { code: "BK002", date: "2026-11-21", close: "101" },
      { code: "BK003", date: "2026-11-20", close: "100" },
      { code: "BK003", date: "2026-11-21", close: "110" },
    ],
  );

  assert.deepEqual(
    series.map((item) => item.code),
    ["BK001", "BK002"],
  );
  assert.deepEqual(series[0]?.points, [
    { date: "2026-11-20", value: 100 },
    { date: "2026-11-21", value: 102 },
  ]);
});

test("does not fabricate rotation history from malformed board kline closes", () => {
  const series = buildBoardRotationSeries(
    "concept",
    [{ code: "BK003", type: "concept", name: "概念一" }],
    [
      { code: "BK003", date: "2026-11-20", close: null },
      { code: "BK003", date: "2026-11-21", close: "0" },
      { code: "BK003", date: "2026-11-24", close: "110" },
    ],
  );

  assert.deepEqual(series[0]?.points, [{ date: "2026-11-24", value: 110 }]);
});
