import assert from "node:assert/strict";
import test from "node:test";
import type { SignalResult } from "@ai-trader/signal-catalog/contracts";
import { nextExpandedSignalId, selectSignalPreview } from "./signal-group-drawer.ts";

function signal(signalId: string): SignalResult {
  return { signalId } as SignalResult;
}

test("signal matrix preview uses the first three signals in catalog order", () => {
  const signals = [
    signal("basic.stock.a"),
    signal("basic.stock.b"),
    signal("basic.stock.c"),
    signal("basic.stock.d"),
  ];

  assert.deepEqual(
    selectSignalPreview(signals).map((item) => item.signalId),
    ["basic.stock.a", "basic.stock.b", "basic.stock.c"],
  );
  assert.equal(selectSignalPreview(signals).length, 3);
});

test("signal drawer expands one item and collapses the previous item", () => {
  assert.equal(nextExpandedSignalId(null, "basic.stock.a"), "basic.stock.a");
  assert.equal(nextExpandedSignalId("basic.stock.a", "basic.stock.b"), "basic.stock.b");
  assert.equal(nextExpandedSignalId("basic.stock.b", "basic.stock.b"), null);
});
