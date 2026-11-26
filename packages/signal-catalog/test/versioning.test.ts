import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CATALOG_VERSION, signals } from "../src/index.ts";
import { validateCatalogVersion, type CatalogVersionBaseline } from "../src/versioning.ts";

const baseline = JSON.parse(
  readFileSync(
    new URL("../fixtures/parameter-snapshot.technical-signals-1.0.0.json", import.meta.url),
    "utf8",
  ),
) as CatalogVersionBaseline;

test("1.0.0 parameters and rule hashes match the frozen release baseline", () => {
  assert.equal(baseline.catalogVersion, CATALOG_VERSION);
  assert.equal(baseline.signalCount, signals.length);
  assert.doesNotThrow(() =>
    validateCatalogVersion({
      catalogVersion: CATALOG_VERSION,
      baseline,
      signals,
    }),
  );
});

test("a parameter threshold change requires a new catalog version", () => {
  const changedSignals = signals.map((signal) =>
    signal.signalId === "basic.market.rvol"
      ? {
          ...signal,
          params: { ...signal.params, breakout_threshold: 1.6 },
        }
      : signal,
  );

  assert.throws(
    () =>
      validateCatalogVersion({
        catalogVersion: CATALOG_VERSION,
        baseline,
        signals: changedSignals,
      }),
    /catalog version/i,
  );
});

test("a formula change requires a new catalog version", () => {
  const changedSignals = signals.map((signal) =>
    signal.signalId === "basic.market.price_vs_ma200"
      ? {
          ...signal,
          rule: "close / MA(close, 150) - 1",
        }
      : signal,
  );

  assert.throws(
    () =>
      validateCatalogVersion({
        catalogVersion: CATALOG_VERSION,
        baseline,
        signals: changedSignals,
      }),
    /catalog version/i,
  );
});
