import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowNode } from "../lib/workflow-contracts.ts";
import { createWorkflowNodeExecutor } from "./workflow-node-executor.ts";

function node(type: WorkflowNode["type"], config: WorkflowNode["config"]): WorkflowNode {
  return {
    id: type,
    type,
    position: { x: 0, y: 0 },
    config,
  } as WorkflowNode;
}

function executor() {
  return createWorkflowNodeExecutor("user-1", {
    resolveTradeDate: async () => "2026-11-17",
    loadWatchlistSymbols: async () => ["600519.SH", "600519.SH"],
    loadStockPoolSymbols: async () => ["000001.SZ"],
    runScreening: async () => ({
      items: [
        {
          symbol: "600519.SH",
          name: "贵州茅台",
          close: 1500,
          score: 90,
          factorScores: {},
        },
      ],
      total: 1,
      strategy: { id: 1, name: "主线策略" },
      elapsedMs: 10,
      fetchMs: 5,
    }),
    runBacktestBatch: async (request) => ({
      total: request.symbols.length,
      succeeded: request.symbols.length,
      failed: 0,
      results: request.symbols.map((symbol) => ({
        symbol,
        ok: true,
        summary: { annualReturn: 0.1 },
      })),
    }),
    generateReview: async (date) => ({
      date: date ?? "2026-11-17",
      sections: [],
      summary: "今日复盘",
      skill: {},
    }),
    startFactorIteration: async () => ({ runId: 9, total: 3 }),
    waitForFactorIteration: async () => ({
      id: 9,
      status: "success",
      message: "完成",
      error: null,
    }),
  });
}

test("stock pool node normalizes watchlist and manual output", async () => {
  const execute = executor();
  const watchlistResult = await execute({
    node: node("stock_pool", { source: "watchlist" }),
    context: { symbols: [] },
    signal: new AbortController().signal,
  });
  assert.deepEqual(watchlistResult.output, {
    symbols: ["600519.SH"],
    total: 1,
  });

  const manualResult = await execute({
    node: node("stock_pool", {
      source: "manual",
      symbols: [" 000001.SZ ", "000001.SZ"],
    }),
    context: { symbols: [] },
    signal: new AbortController().signal,
  });
  assert.deepEqual(manualResult.output, {
    symbols: ["000001.SZ"],
    total: 1,
  });
});

test("screen, backtest, review, and factor nodes return typed summaries", async () => {
  const execute = executor();
  const signal = new AbortController().signal;
  const screen = await execute({
    node: node("screen", { strategyId: 1, topN: 20, scope: "all" }),
    context: { symbols: [] },
    signal,
  });
  assert.deepEqual(screen.output, {
    symbols: ["600519.SH"],
    total: 1,
    strategy: { id: 1, name: "主线策略" },
  });

  const backtest = await execute({
    node: node("backtest", {
      strategy: "ma_cross",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    }),
    context: { symbols: ["600519.SH"] },
    signal,
  });
  assert.deepEqual(backtest.resultRef, {
    type: "backtest",
    symbols: ["600519.SH"],
  });

  const review = await execute({
    node: node("review", {}),
    context: { symbols: [] },
    signal,
  });
  assert.deepEqual(review.resultRef, {
    type: "review",
    date: "2026-11-17",
  });

  const factor = await execute({
    node: node("factor_iterate", {
      description: "测试因子",
      rounds: 3,
    }),
    context: { symbols: [] },
    signal,
  });
  assert.deepEqual(factor.resultRef, {
    type: "factor_job",
    jobRunId: 9,
    path: "/home/factors/iterate/9",
  });
});

test("node executor exposes upstream errors to the DAG engine", async () => {
  const execute = createWorkflowNodeExecutor("user-1", {
    runScreening: async () => {
      throw new Error("quant unavailable");
    },
  });

  await assert.rejects(
    execute({
      node: node("screen", { strategyId: 1, topN: 20, scope: "all" }),
      context: { symbols: [] },
      signal: new AbortController().signal,
    }),
    /quant unavailable/,
  );
});

test("backtest node fails when every symbol fails", async () => {
  const execute = createWorkflowNodeExecutor("user-1", {
    runBacktestBatch: async (request) => ({
      total: request.symbols.length,
      succeeded: 0,
      failed: request.symbols.length,
      results: request.symbols.map((symbol) => ({
        symbol,
        ok: false,
        error: `No data for ${symbol}`,
      })),
    }),
  });

  await assert.rejects(
    execute({
      node: node("backtest", {
        strategy: "ma_cross",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      }),
      context: { symbols: ["600519.SH"] },
      signal: new AbortController().signal,
    }),
    /No data/,
  );
});
