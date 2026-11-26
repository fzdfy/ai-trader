import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBenchmarkRotation,
  type BenchmarkSeries,
} from "./benchmark.ts";

const DATES = Array.from({ length: 21 }, (_, index) =>
  new Date(Date.UTC(2026, 10, index + 1)).toISOString().slice(0, 10),
);

function series(
  code: string,
  name: string,
  closeAtEnd: number,
  dates = DATES,
): BenchmarkSeries {
  return {
    code,
    name,
    points: dates.map((date, index) => ({
      date,
      value: index === dates.length - 1 ? closeAtEnd : 100,
    })),
  };
}

const completeSeries: BenchmarkSeries[] = [
  series("000001.SH", "上证指数", 100),
  series("000300.SH", "沪深300", 99.87),
  series("000905.SH", "中证500", 99.46),
  series("000852.SH", "中证1000", 99.5),
  series("399673.SZ", "创业板50", 99.66),
  series("000688.SH", "科创50", 101.54),
  series("930955.CSI", "中证红利低波100", 99.09),
];

test("main benchmark rotation ranks percentage-point excess returns", () => {
  const result = computeBenchmarkRotation(completeSeries, "20D");

  assert.equal(result.asOf, "2026-11-21");
  assert.equal(result.benchmarkReturn, 0);
  assert.equal(result.validStyleCount, 6);
  assert.equal(result.status, "available");
  assert.equal(result.rows[0]?.code, "000688.SH");
  assert.equal(result.rows[0]?.excessReturn, 1.54);
  assert.equal(result.rows[0]?.rank, 1);
  assert.equal(result.rows.at(-1)?.code, "930955.CSI");
  assert.equal(result.rows.at(-1)?.rank, 6);
});

test("main benchmark rotation keeps a missing index row without substituting another date", () => {
  const missingLatest = completeSeries.map((item) =>
    item.code === "930955.CSI"
      ? { ...item, points: item.points.slice(0, -1) }
      : item,
  );

  const result = computeBenchmarkRotation(missingLatest, "20D");

  const missing = result.rows.find((row) => row.code === "930955.CSI");
  assert.equal(result.asOf, "2026-11-21");
  assert.equal(result.validStyleCount, 5);
  assert.equal(missing?.excessReturn, null);
  assert.equal(missing?.rank, null);
  assert.equal(missing?.quality, "missing");
});

test("main benchmark rotation with fewer than four style peers keeps returns but removes all ranks", () => {
  const result = computeBenchmarkRotation(completeSeries.slice(0, 4), "20D");

  assert.equal(result.validStyleCount, 3);
  assert.equal(result.status, "low");
  assert.equal(result.rows.length, 6);
  assert.equal(result.rows.every((row) => row.rank === null), true);
  assert.equal(result.rows.some((row) => row.excessReturn != null), true);
});

test("main benchmark rotation never fabricates an as-of date without a full window", () => {
  const shortBenchmark = series(
    "000001.SH",
    "上证指数",
    100,
    DATES.slice(-10),
  );
  const result = computeBenchmarkRotation(
    [shortBenchmark, ...completeSeries.slice(1)],
    "20D",
  );

  assert.equal(result.asOf, null);
  assert.equal(result.status, "low");
  assert.equal(result.rows.every((row) => row.excessReturn === null), true);
});
