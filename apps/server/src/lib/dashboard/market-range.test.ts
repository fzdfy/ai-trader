import assert from "node:assert/strict";
import test from "node:test";
import { resolveMarketRange } from "./market-range.ts";

test("1D uses minute granularity and local-day start for A shares", () => {
  const result = resolveMarketRange(
    "1D",
    new Date("2026-11-20T07:30:00.000Z"),
    "a_share",
  );
  assert.equal(result.granularity, "minute");
  assert.equal(result.start.toISOString(), "2026-11-19T16:00:00.000Z");
  assert.equal(result.end.toISOString(), "2026-11-20T07:30:00.000Z");
});

test("1D uses rolling 24 hours for continuous gold", () => {
  const result = resolveMarketRange(
    "1D",
    new Date("2026-11-20T07:30:00.000Z"),
    "global_gold",
  );
  assert.equal(result.start.toISOString(), "2026-11-19T07:30:00.000Z");
});

test("long ranges use daily granularity and never synthesize weekends", () => {
  const result = resolveMarketRange(
    "5D",
    new Date("2026-11-20T07:30:00.000Z"),
    "a_share",
  );
  assert.equal(result.granularity, "daily");
  assert.equal(result.start.toISOString(), "2026-11-12T16:00:00.000Z");
});

test("YTD starts at the asset local year boundary", () => {
  const aShare = resolveMarketRange(
    "YTD",
    new Date("2026-11-20T07:30:00.000Z"),
    "a_share",
  );
  const us = resolveMarketRange(
    "YTD",
    new Date("2026-11-20T07:30:00.000Z"),
    "us_equity",
  );
  assert.equal(aShare.start.toISOString(), "2025-12-31T16:00:00.000Z");
  assert.equal(us.start.toISOString(), "2026-01-01T05:00:00.000Z");
});
