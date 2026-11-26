import assert from "node:assert/strict";
import test from "node:test";

import type { SignalResult } from "../../../../../packages/signal-catalog/src/contracts.ts";
import {
  buildTriggerRows,
  dedupeSnapshotWrites,
  mapStoredSnapshotRow,
  normalizeSignalIdentity,
  snapshotStorageKey,
  type TechnicalSignalSnapshotWrite,
} from "./store.ts";

const signal = (
  signalId: string,
  status: SignalResult["status"],
  value: number | string | null,
): SignalResult => ({
  signalId,
  displayName: signalId,
  rule: "fixture rule",
  params: { fixture: true },
  confirmation: "fixture confirmation",
  invalidation: "fixture invalidation",
  dataRequirements: [
    {
      dataset: "fixture",
      fields: ["close"],
      minHistory: 1,
      required: true,
      source: "fixture",
    },
  ],
  scope: "stock",
  objectType: "stock",
  objectSubtype: null,
  objectCode: "600519.SH",
  status,
  direction: "bullish",
  value,
  unit: "ratio",
  quality: status === "unavailable" ? "missing" : "available",
  proxy: false,
  sampleCount: 320,
  asOf: "2026-11-25",
  computedAt: "2026-11-26T08:00:00.000Z",
  dataSources: ["bar1d_hfq"],
  evidence: { components: [], notes: [], missingFields: [] },
  catalogVersion: "technical-signals-1.0.0",
  definitionHash: "a".repeat(64),
});

const snapshot = (
  overrides: Partial<TechnicalSignalSnapshotWrite> = {},
): TechnicalSignalSnapshotWrite => ({
  objectType: "stock",
  objectSubtype: null,
  objectCode: "600519.SH",
  asOf: "2026-11-25",
  catalogVersion: "technical-signals-1.0.0",
  computedAt: new Date("2026-11-26T08:00:00.000Z"),
  definitionHash: "b".repeat(64),
  inputHash: "c".repeat(64),
  quality: "available",
  dataSources: ["bar1d_hfq"],
  signals: [
    signal("basic.stock.price_vs_ma200", "triggered", 0.04),
    signal("basic.stock.rsi_state", "neutral", 55),
  ],
  summary: { triggered: 1 },
  ...overrides,
});

test("normalizes sector and non-sector identities", () => {
  assert.deepEqual(
    normalizeSignalIdentity({
      objectType: "sector",
      objectSubtype: "industry",
      objectCode: "BK0475",
    }),
    {
      objectType: "sector",
      objectSubtype: "industry",
      objectCode: "BK0475",
    },
  );
  assert.throws(
    () =>
      normalizeSignalIdentity({
        objectType: "sector",
        objectSubtype: null,
        objectCode: "BK0475",
      }),
    /subtype/i,
  );
  assert.throws(
    () =>
      normalizeSignalIdentity({
        objectType: "stock",
        objectSubtype: "industry",
        objectCode: "600519.SH",
      }),
    /subtype/i,
  );
});

test("same object, date and catalog version collapse to one write", () => {
  const first = snapshot();
  const retry = snapshot({ computedAt: new Date("2026-11-26T08:05:00.000Z") });
  const deduped = dedupeSnapshotWrites([first, retry]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.computedAt.toISOString(), "2026-11-26T08:05:00.000Z");
});

test("snapshot storage key includes subtype and catalog version", () => {
  assert.equal(
    snapshotStorageKey(snapshot()),
    "stock||600519.SH|2026-11-25|technical-signals-1.0.0",
  );
});

test("trigger rows exclude neutral and not-applicable signals", () => {
  const rows = buildTriggerRows(
    snapshot({
      signals: [
        signal("basic.stock.price_vs_ma200", "triggered", 0.04),
        signal("basic.stock.rsi_state", "neutral", 55),
        signal("basic.stock.rvol", "unavailable", null),
        signal("basic.stock.obv_trend", "not-applicable", null),
      ],
    }),
  );
  assert.deepEqual(
    rows.map((row) => [row.signalId, row.status]),
    [
      ["basic.stock.price_vs_ma200", "triggered"],
      ["basic.stock.rvol", "unavailable"],
    ],
  );
  assert.equal(rows[0]?.valueNumeric, "0.04");
  assert.equal(rows[0]?.valueText, null);
  assert.equal(rows[1]?.valueNumeric, null);
});

test("historical mapping preserves stored catalog version and definition hash", () => {
  const stored = mapStoredSnapshotRow({
    objectType: "stock",
    objectSubtype: "",
    objectCode: "600519.SH",
    asOf: "2026-01-05",
    catalogVersion: "technical-signals-0.9.0",
    computedAt: new Date("2026-01-06T08:00:00.000Z"),
    definitionHash: "d".repeat(64),
    inputHash: "e".repeat(64),
    quality: "low",
    dataSourcesJson: ["bar1d_hfq"],
    signalsJson: [signal("basic.stock.price_vs_ma200", "triggered", 0.03)],
    summaryJson: { triggered: 1 },
  });
  assert.equal(stored.catalogVersion, "technical-signals-0.9.0");
  assert.equal(stored.definitionHash, "d".repeat(64));
  assert.equal(stored.inputHash, "e".repeat(64));
  assert.equal(stored.signals[0]?.catalogVersion, "technical-signals-1.0.0");
});
