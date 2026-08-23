/**
 * boards 管道 — 同步行业/概念板块排行。
 *
 * 写入两张表：
 *   - board          ：最新快照（覆盖写），行情页展示用
 *   - board_history  ：当日历史快照（date+code 主键，同日覆盖），板块轮动分析用
 *
 * 数据源：quant 数据服务东方财富板块排行（实时，收盘后同步为当日快照）。
 */

import { quant } from "../../../lib/quant";
import type { BoardListItem } from "../../../lib/quant";
import { db } from "../../../db";
import { board, boardHistory } from "../../../db/schema";
import { sql } from "drizzle-orm";

/** 同步一个板块类型（industry / concept）到 board + board_history */
export async function syncBoardType(
  type: "industry" | "concept",
  today: string,
  list: BoardListItem[],
): Promise<number> {
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!;
    const rank = String(i + 1);
    const changePercent = item.change_pct != null ? String(item.change_pct) : null;
    const popularity = item.turnover_rate != null ? String(item.turnover_rate) : null;
    const totalMarketCap = item.total_market_cap != null ? String(item.total_market_cap) : null;

    // 最新快照（覆盖写）
    await db
      .insert(board)
      .values({ code: item.code, type, name: item.name, rank, changePercent, popularity, totalMarketCap, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: board.code,
        set: {
          type,
          name: item.name,
          rank,
          changePercent,
          popularity,
          totalMarketCap,
          updatedAt: sql`now()`,
        },
      });

    // 当日历史快照（同日覆盖为当天最后一次同步结果）
    await db
      .insert(boardHistory)
      .values({
        date: today,
        code: item.code,
        type,
        name: item.name,
        rank,
        changePercent,
        popularity,
        totalMarketCap,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [boardHistory.date, boardHistory.code],
        set: {
          type,
          name: item.name,
          rank,
          changePercent,
          popularity,
          totalMarketCap,
          updatedAt: sql`now()`,
        },
      });

    count++;
  }
  return count;
}

export async function boardsPipeRun(): Promise<void> {
  // 当日日期（历史快照键）
  const today = new Date().toISOString().slice(0, 10);

  // 行业 / 概念各自独立，网络失败不互相影响
  let industries: BoardListItem[] = [];
  let concepts: BoardListItem[] = [];

  try {
    console.log("[boards] fetching industry boards...");
    industries = (await quant.boardList("industry")).rows;
    console.log(`[boards] got ${industries.length} industry boards`);
  } catch (error) {
    console.error("[boards] industry fetch failed (skip):", (error as Error).message ?? error);
  }

  try {
    console.log("[boards] fetching concept boards...");
    concepts = (await quant.boardList("concept")).rows;
    console.log(`[boards] got ${concepts.length} concept boards`);
  } catch (error) {
    console.error("[boards] concept fetch failed (skip):", (error as Error).message ?? error);
  }

  const industryCount = await syncBoardType("industry", today, industries);
  const conceptCount = await syncBoardType("concept", today, concepts);

  console.log(`[boards] done. industry: ${industryCount}, concept: ${conceptCount} (snapshot ${today})`);
}
