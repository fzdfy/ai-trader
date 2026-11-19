import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeWorkflowSymbols,
  summarizeBacktestResults,
  uniqueWorkflowSymbols,
} from "./workflow-action-utils.ts";
import { runBacktest, runBacktestBatch } from "./backtest-service.ts";

process.env.DATA_GOVERNANCE_GATE_MODE = "off";

test("workflow symbols are trimmed, deduplicated, and bounded to fifty", () => {
  const symbols = normalizeWorkflowSymbols([
    " 600519.SH ",
    "600519.SH",
    "000001.SZ",
    ...Array.from({ length: 55 }, (_, index) => `TEST.${index}`),
  ]);

  assert.equal(symbols[0], "600519.SH");
  assert.equal(symbols[1], "000001.SZ");
  assert.equal(symbols.length, 50);
  assert.equal(
    uniqueWorkflowSymbols(Array.from({ length: 55 }, (_, index) => `UNBOUNDED.${index}`)).length,
    55,
  );
});

test("batch backtest summary counts successful and failed symbols", () => {
  assert.deepEqual(
    summarizeBacktestResults([
      { symbol: "600519.SH", ok: true, summary: { annualReturn: 0.12 } },
      { symbol: "000001.SZ", ok: false, error: "timeout" },
    ]),
    {
      total: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { symbol: "600519.SH", ok: true, summary: { annualReturn: 0.12 } },
        { symbol: "000001.SZ", ok: false, error: "timeout" },
      ],
    },
  );
});

test("batch backtest rejects more than fifty unique symbols before execution", async () => {
  await assert.rejects(
    runBacktestBatch({
      symbols: Array.from({ length: 51 }, (_, index) => `TEST.${index}`),
      strategy: "ma_cross",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    }),
    /53|50|最多/,
  );
});

test("single backtest service preserves the quant response contract", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        report: { finalEquity: 112_000 },
        equity: [{ time: "2025-01-02", equity: 100_000 }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  assert.deepEqual(
    await runBacktest({
      symbol: "600519.SH",
      strategy: "ma_cross",
    }),
    {
      report: { finalEquity: 112_000 },
      equity: [{ time: "2025-01-02", equity: 100_000 }],
    },
  );
});

test("batch backtest keeps report and trade count without the equity curve", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        report: { finalEquity: 112_000, durationDays: 240 },
        equity: Array.from({ length: 1000 }, (_, index) => ({
          time: `2025-01-${index}`,
          equity: 100_000 + index,
        })),
        trades: [{}, {}],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  const result = await runBacktestBatch({
    symbols: ["600519.SH"],
    strategy: "ma_cross",
    startDate: "2025-01-01",
    endDate: "2025-12-31",
  });
  assert.deepEqual(result.results[0]?.summary, {
    report: { finalEquity: 112_000, durationDays: 240 },
    tradeCount: 2,
  });
});
