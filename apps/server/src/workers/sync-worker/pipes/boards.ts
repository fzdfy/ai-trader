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
import { and, eq, notInArray, sql } from "drizzle-orm";
import { updateProgress } from "../progress";
import { getSyncTradeDate } from "../calendar";

/**
 * 同步一个板块类型（industry / concept）到 board + board_history。
 *
 * @param progress 进度上下文 { done: 已处理量偏移, total: 总量 }；undefined 表示不上报（脚本直跑）
 */
export async function syncBoardType(
  type: "industry" | "concept",
  today: string,
  list: BoardListItem[],
  progress?: { done: number; total: number },
): Promise<number> {
  const boardRows = list.map((item, i) => ({
    code: item.code,
    type,
    name: item.name,
    rank: String(i + 1),
    changePercent: item.change_pct != null ? String(item.change_pct) : null,
    popularity: item.turnover_rate != null ? String(item.turnover_rate) : null,
    totalMarketCap: item.total_market_cap != null ? String(item.total_market_cap) : null,
    leader: item.leader || null,
    leaderChange: item.leader_change != null ? String(item.leader_change) : null,
    updatedAt: new Date(),
  }));

  const historyRows = list.map((item, i) => ({
    date: today,
    code: item.code,
    type,
    name: item.name,
    rank: String(i + 1),
    changePercent: item.change_pct != null ? String(item.change_pct) : null,
    popularity: item.turnover_rate != null ? String(item.turnover_rate) : null,
    totalMarketCap: item.total_market_cap != null ? String(item.total_market_cap) : null,
    updatedAt: new Date(),
  }));

  // 最新快照（覆盖写），分批 insert 避免逐条 N+1
  for (let j = 0; j < boardRows.length; j += 200) {
    await db
      .insert(board)
      .values(boardRows.slice(j, j + 200))
      .onConflictDoUpdate({
        target: board.code,
        set: {
          type: sql.raw("excluded.type"),
          name: sql.raw("excluded.name"),
          rank: sql.raw("excluded.rank"),
          changePercent: sql.raw("excluded.change_percent"),
          popularity: sql.raw("excluded.popularity"),
          totalMarketCap: sql.raw("excluded.total_market_cap"),
          leader: sql.raw("excluded.leader"),
          leaderChange: sql.raw("excluded.leader_change"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }

  // 当日历史快照（同日覆盖为当天最后一次同步结果）
  for (let j = 0; j < historyRows.length; j += 200) {
    await db
      .insert(boardHistory)
      .values(historyRows.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [boardHistory.date, boardHistory.code],
        set: {
          type: sql.raw("excluded.type"),
          name: sql.raw("excluded.name"),
          rank: sql.raw("excluded.rank"),
          changePercent: sql.raw("excluded.change_percent"),
          popularity: sql.raw("excluded.popularity"),
          totalMarketCap: sql.raw("excluded.total_market_cap"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }

  // 本类型同步完成上报一次进度
  if (progress) {
    updateProgress(
      progress.done + list.length,
      progress.total,
      `同步${type === "industry" ? "行业" : "概念"}板块 ${progress.done + list.length}/${progress.total}`,
    );
  }

  return list.length;
}

/**
 * 清理某个板块类型中本次未出现的旧板块（退市 / 下架）。
 * 仅清理 board 最新快照表，board_history 历史快照保留。
 * 注意：codes 为空时跳过，避免数据源瞬时返回空导致误删全部。
 */
async function pruneStaleBoards(type: "industry" | "concept", codes: string[]): Promise<number> {
  if (codes.length === 0) return 0;
  const res = await db
    .delete(board)
    .where(and(eq(board.type, type), notInArray(board.code, codes)));
  return res.rowCount ?? 0;
}

export async function boardsPipeRun(): Promise<void> {
  // 当日日期（历史快照键）
  const today = await getSyncTradeDate();
  if (!today) throw new Error("[boards] 无可用交易日（交易日历为空或异常）");

  // 记录失败的类型；任一类型失败则任务最终标记 failed 触发重试，避免部分板块快照当天停留在旧数据
  const errors: string[] = [];

  // 行业 / 概念各自独立，网络失败不互相影响
  let industries: BoardListItem[] = [];
  let concepts: BoardListItem[] = [];
  let industriesOk = false;
  let conceptsOk = false;

  try {
    console.log("[boards] fetching industry boards...");
    industries = (await quant.boardList("industry")).rows;
    industriesOk = true;
    console.log(`[boards] got ${industries.length} industry boards`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[boards] industry fetch failed:", msg);
    errors.push(`industry: ${msg}`);
  }

  try {
    console.log("[boards] fetching concept boards...");
    concepts = (await quant.boardList("concept")).rows;
    conceptsOk = true;
    console.log(`[boards] got ${concepts.length} concept boards`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[boards] concept fetch failed:", msg);
    errors.push(`concept: ${msg}`);
  }

  const totalBoards = industries.length + concepts.length;
  if (totalBoards === 0) {
    throw new Error("[boards] 行业/概念板块均无数据，未写入任何记录");
  }
  updateProgress(0, totalBoards, "开始同步板块排行");

  const industryCount = await syncBoardType("industry", today, industries, { done: 0, total: totalBoards });
  const conceptCount = await syncBoardType("concept", today, concepts, { done: industries.length, total: totalBoards });

  // 清理本次未出现的旧板块（仅对拉取成功的类型），避免退市/下架板块残留
  let pruned = 0;
  if (industriesOk) {
    pruned += await pruneStaleBoards("industry", industries.map((b) => b.code));
  }
  if (conceptsOk) {
    pruned += await pruneStaleBoards("concept", concepts.map((b) => b.code));
  }

  // 兜底：最后一批未满 PROGRESS_STEP 时确保进度到 100%
  if (totalBoards > 0) {
    updateProgress(totalBoards, totalBoards, `板块排行同步完成 ${totalBoards}/${totalBoards}`);
  }

  console.log(`[boards] done. industry: ${industryCount}, concept: ${conceptCount}, pruned: ${pruned} (snapshot ${today})`);

  // 成功部分已写入（幂等），再抛出失败以让 wrapJob 标记 failed 触发重试，补齐失败类型
  if (errors.length > 0) {
    throw new Error(`[boards] 部分板块类型失败（${errors.join("; ")}），已写入成功部分，等待重试`);
  }
}
