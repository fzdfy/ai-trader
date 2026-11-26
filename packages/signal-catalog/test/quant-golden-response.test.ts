import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateSignalResult, type SignalResult } from "../src/contracts.ts";

interface QuantGoldenResponse {
  catalogVersion: string;
  asOf: string;
  computedAt: string;
  technical: Record<string, unknown>;
  signals: SignalResult[];
}

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/quant-evaluate-response.golden.json", import.meta.url), "utf8"),
) as QuantGoldenResponse;

test("Quant golden response satisfies the shared Server contract", () => {
  assert.equal(fixture.catalogVersion, "technical-signals-1.0.0");
  assert.equal(fixture.signals.length, 34);
  for (const signal of fixture.signals) {
    assert.doesNotThrow(() => validateSignalResult(signal), signal.signalId);
  }
  assert.equal(
    fixture.signals.filter((signal) => signal.signalId.startsWith("basic.stock.")).length,
    10,
  );
  assert.equal(
    fixture.signals.filter((signal) => signal.signalId.startsWith("pattern.stock.")).length,
    12,
  );
  assert.equal(
    fixture.signals.filter((signal) => signal.signalId.startsWith("micro.stock.")).length,
    12,
  );
});

test("Quant golden response preserves unavailable data honestly", () => {
  const priceVsMa = fixture.signals.find(
    (signal) => signal.signalId === "basic.stock.price_vs_ma200",
  );
  assert.equal(priceVsMa?.status, "unavailable");
  assert.equal(priceVsMa?.value, null);
  assert.ok(
    fixture.signals.every(
      (signal) =>
        signal.status !== "unavailable" ||
        signal.quality === "missing" ||
        signal.quality === "not-applicable",
    ),
  );
});
