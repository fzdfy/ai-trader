import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { adjFactor, bar1dRaw, fundFlowRank, quoteLatest } from "./schema/md.ts";
import { stockAnalysisSnapshot } from "./schema/stock-analysis.ts";
import { backtestRun } from "./schema/bt.ts";
import {
  technicalSignalSnapshot,
  technicalSignalTrigger,
  technicalSignalValidation,
} from "./schema/technical-signals.ts";

const primaryKeyColumns = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).primaryKeys[0]?.columns.map((column) => column.name) ?? [];

const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).columns.map((column) => column.name);

test("technical signal tables use independent names and composite keys", () => {
  assert.equal(getTableConfig(technicalSignalSnapshot).name, "technical_signal_snapshot");
  assert.equal(getTableConfig(technicalSignalTrigger).name, "technical_signal_trigger");
  assert.equal(getTableConfig(technicalSignalValidation).name, "technical_signal_validation");

  assert.deepEqual(primaryKeyColumns(technicalSignalSnapshot), [
    "object_type",
    "object_subtype",
    "object_code",
    "as_of",
    "catalog_version",
  ]);
  assert.deepEqual(primaryKeyColumns(technicalSignalTrigger), [
    "object_type",
    "object_subtype",
    "object_code",
    "as_of",
    "catalog_version",
    "signal_id",
  ]);
  assert.deepEqual(primaryKeyColumns(technicalSignalValidation), [
    "signal_id",
    "scope",
    "horizon",
    "catalog_version",
    "validation_version",
  ]);
});

test("snapshot table preserves definition and input evidence", () => {
  const config = getTableConfig(technicalSignalSnapshot);
  const names = columnNames(technicalSignalSnapshot);
  for (const name of [
    "computed_at",
    "definition_hash",
    "input_hash",
    "quality",
    "data_sources_json",
    "signals_json",
    "summary_json",
  ]) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(
    config.indexes.some(
      (index) => index.config.name === "technical_signal_snapshot_object_date_idx",
    ),
  );
  assert.ok(config.checks.some((check) => check.name === "technical_signal_snapshot_subtype_chk"));
});

test("trigger table indexes filterable state without duplicating full matrix", () => {
  const config = getTableConfig(technicalSignalTrigger);
  const names = columnNames(technicalSignalTrigger);
  for (const name of [
    "signal_id",
    "layer",
    "status",
    "direction",
    "value_numeric",
    "quality",
    "evidence_summary",
  ]) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(
    config.indexes.some(
      (index) => index.config.name === "technical_signal_trigger_status_date_idx",
    ),
  );
});

test("validation table keeps horizon and out-of-sample evidence separate", () => {
  const names = columnNames(technicalSignalValidation);
  for (const name of [
    "sample_count",
    "win_rate",
    "profit_loss_ratio",
    "expected_return",
    "max_drawdown",
    "validation_start",
    "validation_end",
    "object_scope",
    "completed_at",
  ]) {
    assert.ok(names.includes(name), name);
  }
});

test("technical signal tables do not alter existing market and PIT contracts", () => {
  assert.deepEqual(primaryKeyColumns(bar1dRaw), ["time", "symbol"]);
  assert.ok(columnNames(bar1dRaw).includes("indicators"));
  assert.deepEqual(primaryKeyColumns(adjFactor), ["symbol", "date", "known_at"]);
  assert.equal(
    getTableConfig(quoteLatest).columns.find((column) => column.name === "symbol")?.primary,
    true,
  );
  assert.equal(getTableConfig(backtestRun).name, "backtest_run");
  assert.ok(
    columnNames(fundFlowRank).includes("main_net_inflow"),
    "fund flow columns remain available",
  );
  assert.deepEqual(primaryKeyColumns(stockAnalysisSnapshot), [
    "symbol",
    "as_of_trade_date",
    "model_version",
    "input_hash",
  ]);
});
