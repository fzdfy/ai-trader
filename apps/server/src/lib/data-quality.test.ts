import assert from "node:assert/strict";
import test from "node:test";
import { buildQualitySummary } from "./data-quality.ts";

const now = "2026-11-19T12:00:00.000Z";
const freshTable = {
  table: "board",
  name: "板块排行",
  updatedAt: "2026-11-19T10:00:00.000Z",
  staleAfterHours: 24,
};

test("marks a tripped provider as critical", () => {
  const summary = buildQualitySummary({
    now,
    tables: [freshTable],
    gaps: [],
    providers: [{ name: "eastmoney", tripped: true }],
  });

  assert.equal(summary.status, "critical");
  assert.equal(summary.counts.degradedProviders, 1);
});

test("warns when an unresolved data gap exists", () => {
  const summary = buildQualitySummary({
    now,
    tables: [freshTable],
    gaps: [
      {
        id: 1,
        symbol: "000001.SZ",
        timeframe: "1d",
        missingStart: "2026-11-18T00:00:00.000Z",
        missingEnd: "2026-11-18T00:00:00.000Z",
        detectedAt: "2026-11-19T08:00:00.000Z",
      },
    ],
    providers: [],
  });

  assert.equal(summary.status, "warning");
  assert.equal(summary.counts.unresolvedGaps, 1);
});

test("marks stale and empty tables separately", () => {
  const stale = buildQualitySummary({
    now,
    tables: [
      {
        ...freshTable,
        updatedAt: "2026-11-17T00:00:00.000Z",
      },
    ],
    gaps: [],
    providers: [],
  });
  const empty = buildQualitySummary({
    now,
    tables: [{ ...freshTable, updatedAt: null }],
    gaps: [],
    providers: [],
  });

  assert.equal(stale.tables[0]?.status, "warning");
  assert.equal(stale.tables[0]?.reason, "超过 24 小时未更新");
  assert.equal(empty.tables[0]?.status, "missing");
  assert.equal(empty.counts.missingTables, 1);
});

test("reports healthy for fresh data without gaps or failed jobs", () => {
  const summary = buildQualitySummary({
    now,
    tables: [freshTable],
    gaps: [],
    providers: [{ name: "eastmoney", tripped: false }],
    failedJobs: 0,
  });

  assert.equal(summary.status, "healthy");
  assert.equal(summary.tables[0]?.status, "healthy");
});

test("uses the full unresolved-gap count even when displayed gaps are limited", () => {
  const summary = buildQualitySummary({
    now,
    tables: [freshTable],
    gaps: [
      {
        id: 1,
        symbol: "000001.SZ",
        timeframe: "1d",
        missingStart: "2026-11-18T00:00:00.000Z",
        missingEnd: "2026-11-18T00:00:00.000Z",
        detectedAt: "2026-11-19T08:00:00.000Z",
      },
    ],
    unresolvedGapCount: 51,
    providers: [],
  });

  assert.equal(summary.counts.unresolvedGaps, 51);
});
