import { db } from "../../db";
import { watchlist } from "../../db/schema";
import {
  syncStockAnnouncements,
  syncStockResearchReports,
  type ContentModuleResult,
} from "../../services/stock-content-service";
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

export async function runStockResearchReportSync(): Promise<void> {
  await runWatchlistContentSync("自选股研报", syncStockResearchReports);
}
