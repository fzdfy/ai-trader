import { eq } from "drizzle-orm";
import { db } from "../db";
import { stockPool, watchlist } from "../db/schema";
import { getSyncTradeDate, localDateStr } from "../workers/sync-worker/calendar";
import { runBacktestBatch } from "./backtest-service";
import { startFactorIteration, waitForFactorIteration } from "./factor-iteration-service";
import { generateReview } from "./review-service";
import { runScreening } from "./screening-service";
import type { WorkflowNodeExecutionInput, WorkflowNodeExecutionResult } from "./workflow-engine";
import {
  normalizeWorkflowSymbols,
  uniqueWorkflowSymbols,
  WorkflowActionError,
} from "./workflow-action-utils";

interface WorkflowNodeExecutorDependencies {
  runScreening: typeof runScreening;
  runBacktestBatch: typeof runBacktestBatch;
  generateReview: typeof generateReview;
  startFactorIteration: typeof startFactorIteration;
  waitForFactorIteration: typeof waitForFactorIteration;
  loadWatchlistSymbols: (userId: string) => Promise<string[]>;
  loadStockPoolSymbols: (tradeDate: string) => Promise<string[]>;
  resolveTradeDate: () => Promise<string | null>;
}

const defaultDependencies: WorkflowNodeExecutorDependencies = {
  runScreening,
  runBacktestBatch,
  generateReview,
  startFactorIteration,
  waitForFactorIteration,
  async loadWatchlistSymbols(userId) {
    const rows = await db
      .select({ symbol: watchlist.symbol })
      .from(watchlist)
      .where(eq(watchlist.userId, userId));
    return rows.map((row) => row.symbol);
  },
  async loadStockPoolSymbols(tradeDate) {
    const rows = await db
      .select({ symbol: stockPool.symbol })
      .from(stockPool)
      .where(eq(stockPool.date, tradeDate));
    return rows.map((row) => row.symbol);
  },
  resolveTradeDate: getSyncTradeDate,
};

export function createWorkflowNodeExecutor(
  userId: string,
  overrides: Partial<WorkflowNodeExecutorDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const resolveTradeDate = async () => (await dependencies.resolveTradeDate()) ?? localDateStr();

  return async ({
    node,
    context,
    signal,
  }: WorkflowNodeExecutionInput): Promise<WorkflowNodeExecutionResult> => {
    switch (node.type) {
      case "trigger":
        return { output: { trigger: node.config } };

      case "stock_pool": {
        if (node.config.source === "manual") {
          const symbols = uniqueWorkflowSymbols(node.config.symbols);
          return { output: { symbols, total: symbols.length } };
        }
        if (node.config.source === "watchlist") {
          const symbols = uniqueWorkflowSymbols(await dependencies.loadWatchlistSymbols(userId));
          return { output: { symbols, total: symbols.length } };
        }
        const symbols = uniqueWorkflowSymbols(
          await dependencies.loadStockPoolSymbols(context.tradeDate ?? (await resolveTradeDate())),
        );
        return { output: { symbols, total: symbols.length } };
      }

      case "screen": {
        const result = await dependencies.runScreening(
          {
            strategyId: node.config.strategyId,
            topN: node.config.topN,
            scope: node.config.scope,
            boardCodes: node.config.boardCodes,
            excludes: node.config.excludes,
            userId,
          },
          signal,
        );
        return {
          output: {
            symbols: uniqueWorkflowSymbols(result.items.map((item) => item.symbol)),
            total: result.total,
            strategy: result.strategy,
          },
          resultRef: {
            type: "screen",
            strategyId: result.strategy.id,
          },
        };
      }

      case "backtest": {
        const symbols =
          context.symbols.length > 0
            ? context.symbols
            : normalizeWorkflowSymbols(node.config.symbols ?? []);
        if (symbols.length === 0) {
          throw new WorkflowActionError("回测节点没有可用标的", 400);
        }
        const summary = await dependencies.runBacktestBatch(
          {
            symbols,
            strategy: node.config.strategy,
            params: node.config.params,
            config: node.config.config,
            startDate: node.config.startDate,
            endDate: node.config.endDate,
            asOf: node.config.asOf,
          },
          signal,
        );
        if (summary.total > 0 && summary.succeeded === 0) {
          throw new WorkflowActionError(summary.results[0]?.error ?? "全部标的回测失败", 500);
        }
        return {
          output: summary,
          resultRef: { type: "backtest", symbols },
        };
      }

      case "review": {
        const result = await dependencies.generateReview(
          context.tradeDate ?? (await resolveTradeDate()),
          signal,
        );
        return {
          output: {
            date: result.date,
            summary: result.summary.slice(0, 500),
            sectionCount: result.sections.length,
          },
          resultRef: { type: "review", date: result.date },
        };
      }

      case "factor_iterate": {
        const { runId } = await dependencies.startFactorIteration({
          description: node.config.description,
          rounds: node.config.rounds,
          horizon: node.config.horizon,
          layers: node.config.layers,
          bars: node.config.bars,
          maxSymbols: node.config.maxSymbols,
          minSymbols: node.config.minSymbols,
          validRatio: node.config.validRatio,
          asOf: node.config.asOf,
        });
        const run = await dependencies.waitForFactorIteration(runId, {
          signal,
        });
        if (run.status !== "success") {
          throw new WorkflowActionError(run.error ?? "AI 因子迭代任务失败", 500);
        }
        return {
          output: {
            jobRunId: run.id,
            message: run.message,
          },
          resultRef: {
            type: "factor_job",
            jobRunId: run.id,
            path: `/home/factors/iterate/${run.id}`,
          },
        };
      }
    }
  };
}
