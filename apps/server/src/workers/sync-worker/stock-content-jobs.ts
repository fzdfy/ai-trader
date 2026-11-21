import { db } from "../../db";
import { watchlist } from "../../db/schema";
import {
  syncStockAnalystConsensus,
  syncStockAnnouncements,
  syncStockFinancialSnapshot,
  syncStockFinancialStatements,
  syncStockResearchReports,
  syncStockValuationHistory,
  type ContentModuleResult,
} from "../../services/stock-content-service";
import {
  prepareResearchIndexWindow,
  type PrepareIndexResult,
} from "../../services/research-index-service";
import { updateProgress } from "./progress";

async function watchlistSymbols(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ symbol: watchlist.symbol })
    .from(watchlist)
    .orderBy(watchlist.symbol);
  return rows.map((row) => row.symbol);
}

async function runWatchlistContentSync(
  label: string,
  sync: (symbol: string) => Promise<ContentModuleResult>,
): Promise<void> {
  const symbols = await watchlistSymbols();
  updateProgress(0, symbols.length, `开始同步${label}`);
  const failures: string[] = [];
  let inserted = 0;

  for (const [index, symbol] of symbols.entries()) {
    const result = await sync(symbol);
    inserted += result.inserted;
    if (!result.ok) failures.push(`${symbol}: ${result.error ?? "未知错误"}`);
    updateProgress(
      index + 1,
      symbols.length,
      `已处理 ${index + 1}/${symbols.length} 只自选股（新增 ${inserted} 条）`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`${label}部分失败：${failures.join("、")}`);
  }
}

export async function runStockAnnouncementSync(): Promise<void> {
  await runWatchlistContentSync("自选股公告", syncStockAnnouncements);
}

type PrepareWatchlistWindow = (symbol: string) => Promise<PrepareIndexResult>;

export async function runStockResearchReportSync(
  prepareWindow: PrepareWatchlistWindow = (symbol) =>
    prepareResearchIndexWindow(symbol, 30, undefined, "watchlist"),
): Promise<void> {
  await runWatchlistContentSync("自选股研报", async (symbol) => {
    const result = await syncStockResearchReports(symbol);
    if (!result.ok) return result;
    try {
      const prepared = await prepareWindow(symbol);
      if (prepared.failed > 0) {
        return {
          ...result,
          ok: false,
          error: `研报全文入队失败 ${prepared.failed} 篇`,
        };
      }
      return result;
    } catch (error) {
      return {
        ...result,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export async function runStockFundamentalsSync(): Promise<void> {
  const symbols = await watchlistSymbols();
  updateProgress(0, symbols.length, "开始同步自选股基本面");
  const failures: string[] = [];
  let inserted = 0;

  for (const [index, symbol] of symbols.entries()) {
    const requests = [
      ["一致预期", syncStockAnalystConsensus(symbol)],
      ["财务快照", syncStockFinancialSnapshot(symbol)],
      ["财务三表", syncStockFinancialStatements(symbol)],
    ] as const;
    const eligibleRequests = symbol.endsWith(".BJ")
      ? requests
      : [...requests, ["估值历史", syncStockValuationHistory(symbol)] as const];
    const settled = await Promise.allSettled(eligibleRequests.map(([, request]) => request));
    settled.forEach((item, moduleIndex) => {
      const label = eligibleRequests[moduleIndex]?.[0] ?? "基本面";
      if (item.status === "rejected") {
        failures.push(`${symbol}/${label}: ${String(item.reason)}`);
        return;
      }
      inserted += item.value.inserted;
      if (!item.value.ok) {
        failures.push(`${symbol}/${label}: ${item.value.error ?? "未知错误"}`);
      }
    });
    updateProgress(
      index + 1,
      symbols.length,
      `已处理 ${index + 1}/${symbols.length} 只自选股基本面（新增 ${inserted} 条）`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`自选股基本面部分失败：${failures.join("、")}`);
  }
}
