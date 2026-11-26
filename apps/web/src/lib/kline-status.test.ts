import assert from "node:assert/strict";
import test from "node:test";
import { klineRequestSignal, resolveKlineStatus } from "./kline-status.ts";

test("K-line status distinguishes loading from empty data", () => {
  assert.equal(resolveKlineStatus({ bars: null, error: null }), "loading");
  assert.equal(resolveKlineStatus({ bars: [], error: null }), "empty");
});

test("K-line errors take precedence over cached or empty bars", () => {
  assert.equal(
    resolveKlineStatus({ bars: [{ close: 1 }], error: new Error("timeout") }),
    "error",
  );
  assert.equal(resolveKlineStatus({ bars: [], error: "timeout" }), "error");
});

test("K-line status marks non-empty data as ready", () => {
  assert.equal(resolveKlineStatus({ bars: [{ close: 1 }], error: null }), "ready");
});

test("K-line requests time out instead of waiting for the upstream proxy limit", async () => {
  const signal = klineRequestSignal(undefined, 20);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(signal.aborted, true);
});

test("K-line request timeout preserves caller cancellation", () => {
  const controller = new AbortController();
  const signal = klineRequestSignal(controller.signal, 10_000);
  controller.abort();
  assert.equal(signal.aborted, true);
});
