import assert from "node:assert/strict";
import test from "node:test";
import {
  computeGrowthDefense,
  computeRotationRanking,
  type RotationSeries,
} from "./compute.ts";

function series(code: string, values: number[]): RotationSeries {
  return {
    code,
    name: code,
    points: values.map((value, index) => ({
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      value,
    })),
  };
}

test("rotation ranking sorts by current relative return and computes rank change", () => {
  const rows = computeRotationRanking(
    [
      series("A", Array.from({ length: 41 }, (_, index) => 100 + index * 1.2)),
      series("B", Array.from({ length: 41 }, (_, index) => 100 + index * 0.5)),
      series("C", Array.from({ length: 41 }, (_, index) => 100 - index * 0.2)),
    ],
    "20D",
  );

  assert.equal(rows[0]?.code, "A");
  assert.equal(rows[0]?.rank, 1);
  assert.equal(rows[0]?.phase, "加速");
  assert.equal(rows[2]?.phase, "退潮");
});

test("rotation ranking marks insufficient history without inventing rank change", () => {
  const rows = computeRotationRanking(
    [series("A", [100, 101, 102])],
    "20D",
  );
  assert.equal(rows[0]?.rankChange, null);
  assert.equal(rows[0]?.quality, "missing");
});

test("growth defense state uses ratio zones and aligned relative return", () => {
  const result = computeGrowthDefense(
    series("399673.SZ", Array.from({ length: 41 }, (_, index) => 2500 + index * 10)),
    series("930955.CSI", Array.from({ length: 41 }, (_, index) => 11000 + index * 5)),
  );

  assert.equal(result.state, "中间区");
  assert.ok((result.relativeReturn20d ?? 0) > 0);
  assert.equal(result.thresholdLow, 0.16);
  assert.equal(result.thresholdHigh, 0.28);
});
