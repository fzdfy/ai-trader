import {
  normalizeWorkflowSymbols,
  summarizeBacktestResults,
  WorkflowActionError,
} from "./workflow-action-utils.ts";
import { assertResearchDataReady } from "../lib/data-governance/quality-gate.ts";

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

export interface BacktestRequest {
  symbol: string;
  strategy: string;
  params?: Record<string, number>;
  config?: Record<string, unknown>;
  startDate?: string;
  endDate?: string;
  asOf?: string;
}

export async function runBacktest(
  request: BacktestRequest,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const symbol = request.symbol?.trim();
  const strategy = request.strategy?.trim();
  if (!symbol) throw new WorkflowActionError("symbol is required", 400);
  if (!strategy) throw new WorkflowActionError("strategy is required", 400);
  const gate = await assertResearchDataReady("backtest");

  const result = await submitBacktest({ ...request, symbol, strategy }, signal);
  return gate.warnings.length > 0
    ? { ...result, governance: { mode: gate.mode, warnings: gate.warnings } }
    : result;
}

async function submitBacktest(
  request: BacktestRequest & { symbol: string; strategy: string },
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const { symbol, strategy } = request;
  signal?.throwIfAborted();
  const response = await fetch(`${QUANT_URL}/api/v1/backtests/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol,
      strategy,
      params: request.params ?? {},
      config: request.config,
      startDate: request.startDate,
      endDate: request.endDate,
      asOf: request.asOf,
    }),
    signal,
  });
  const payload = (await response.json()) as {
    detail?: string;
  } & Record<string, unknown>;
  if (!response.ok) {
    const status =
      response.status === 400 || response.status === 404 || response.status === 500
        ? response.status
        : 502;
    throw new WorkflowActionError(payload.detail ?? "Backtest failed", status);
  }
  return payload;
}

export type BacktestRequestWithoutSymbol = Omit<BacktestRequest, "symbol">;

export interface BacktestBatchRequest extends BacktestRequestWithoutSymbol {
  symbols: string[];
}

export interface BacktestBatchItem {
  symbol: string;
  ok: boolean;
  summary?: Record<string, unknown>;
  error?: string;
}

function compactBacktestSummary(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    report: payload.report ?? null,
    tradeCount: Array.isArray(payload.trades) ? payload.trades.length : null,
  };
}

export async function runBacktestBatch(
  request: BacktestBatchRequest,
  signal?: AbortSignal,
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: BacktestBatchItem[];
  governance?: {
    mode: string;
    warnings: unknown[];
  };
}> {
  const uniqueSymbols = new Set(request.symbols.map((symbol) => symbol.trim()).filter(Boolean));
  if (uniqueSymbols.size > 50) {
    throw new WorkflowActionError(`回测最多允许 50 个标的，当前为 ${uniqueSymbols.size} 个`, 400);
  }
  const gate = await assertResearchDataReady("backtest");

  const results: BacktestBatchItem[] = [];
  for (const symbol of normalizeWorkflowSymbols(request.symbols)) {
    signal?.throwIfAborted();
    try {
      const summary = await submitBacktest(
        {
          ...request,
          symbol,
          strategy: request.strategy.trim(),
        },
        signal,
      );
      results.push({
        symbol,
        ok: true,
        summary: compactBacktestSummary(summary),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      results.push({
        symbol,
        ok: false,
        error: (error as Error)?.message ?? String(error),
      });
    }
  }

  const summary = summarizeBacktestResults(results);
  return gate.warnings.length > 0
    ? { ...summary, governance: { mode: gate.mode, warnings: gate.warnings } }
    : summary;
}
