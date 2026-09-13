/**
 * mainline-signals 管道 — 同步主线六维新增数据源到落库表：
 *   - board_fund_flow_period : quant.boardFundFlow(industry/concept, "5d") → 板块 5 日资金持续性
 *   - dragon_tiger_daily     : quant.dailyDragonTiger(today) → 机构/游资确认（龙虎榜）
 *   - hot_reason             : quant.hotReason(today) → 题材催化（同花顺题材归因）
 *
 * 数据源：quant 数据服务（东财板块周期资金流 / 东财全市场龙虎榜 / 同花顺强势股题材归因）。
 * 写入策略：upsert（各自主键，同日覆盖为当天最后一次同步结果）。
 * 上游返回 6 位裸代码，落库前转换为标准 symbol（60x/68x→.SH，00x/30x→.SZ，43/83/87/88/92→.BJ）。
 */

import { quant } from "../../../lib/quant";
import type { BoardFundFlowItem, HotReasonItem, DragonTigerStock } from "../../../lib/quant";
import { db } from "../../../db";
import { boardFundFlowPeriod, dragonTigerDaily, hotReason } from "../../../db/schema";
import { sql } from "drizzle-orm";
import { updateProgress } from "../progress";
import { localDateStr } from "../calendar";

/** 东财原始 6 位代码 → 标准 symbol（60x/68x→.SH，00x/30x→.SZ，43/83/87/88/92→.BJ） */
function codeToSymbol(code: string): string {
  if (code.includes(".")) return code;
  if (/^(60|68)/.test(code)) return `${code}.SH`;
  if (/^(00|30)/.test(code)) return `${code}.SZ`;
  if (/^(43|83|87|88|92)/.test(code)) return `${code}.BJ`;
  return `${code}.SH`;
}

/** 数值统一为 string | null，与 drizzle numeric 列的插入类型保持一致 */
function toStr(v: number | null | undefined): string | null {
  return v == null ? null : String(v);
}

/** upsert 板块 5 日资金流（industry / concept） */
async function upsertBoardFundFlow5d(
  today: string,
  boardType: "industry" | "concept",
  rows: BoardFundFlowItem[],
): Promise<number> {
  const values = rows.map((r, i) => ({
    date: today,
    boardType,
    period: "5d" as const,
    code: r.code,
    name: r.name,
    rank: i + 1,
    changePercent: toStr(r.change_pct),
    mainNetInflow: toStr(r.main_net),
    mainNetInflowPercent: toStr(r.main_pct),
    topStockCode: r.top_stock_code ? codeToSymbol(r.top_stock_code) : null,
    topStockName: r.top_stock_name || null,
    updatedAt: new Date(),
  }));
  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(boardFundFlowPeriod)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [
          boardFundFlowPeriod.date,
          boardFundFlowPeriod.boardType,
          boardFundFlowPeriod.period,
          boardFundFlowPeriod.code,
        ],
        set: {
          rank: sql.raw("excluded.rank"),
          name: sql.raw("excluded.name"),
          changePercent: sql.raw("excluded.change_percent"),
          mainNetInflow: sql.raw("excluded.main_net_inflow"),
          mainNetInflowPercent: sql.raw("excluded.main_net_inflow_percent"),
          topStockCode: sql.raw("excluded.top_stock_code"),
          topStockName: sql.raw("excluded.top_stock_name"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }
  return values.length;
}

/** upsert 全市场龙虎榜 */
async function upsertDragonTiger(today: string, stocks: DragonTigerStock[]): Promise<number> {
  const values = stocks.map((r) => ({
    date: today,
    symbol: codeToSymbol(r.code),
    name: r.name,
    reason: r.reason || null,
    close: toStr(r.close),
    changePercent: toStr(r.change_pct),
    netBuyWan: toStr(r.net_buy_wan),
    buyWan: toStr(r.buy_wan),
    sellWan: toStr(r.sell_wan),
    turnoverPercent: toStr(r.turnover_pct),
    updatedAt: new Date(),
  }));
  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(dragonTigerDaily)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [dragonTigerDaily.date, dragonTigerDaily.symbol],
        set: {
          name: sql.raw("excluded.name"),
          reason: sql.raw("excluded.reason"),
          close: sql.raw("excluded.close"),
          changePercent: sql.raw("excluded.change_percent"),
          netBuyWan: sql.raw("excluded.net_buy_wan"),
          buyWan: sql.raw("excluded.buy_wan"),
          sellWan: sql.raw("excluded.sell_wan"),
          turnoverPercent: sql.raw("excluded.turnover_percent"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }
  return values.length;
}

/** upsert 同花顺强势股 + 题材归因 */
async function upsertHotReason(today: string, rows: HotReasonItem[]): Promise<number> {
  const values = rows.map((r) => ({
    date: today,
    symbol: codeToSymbol(r.code),
    name: r.name,
    reason: r.reason || null,
    close: toStr(r.close),
    change: toStr(r.change),
    changePercent: toStr(r.change_pct),
    turnoverRate: toStr(r.turnover_rate),
    amount: toStr(r.amount),
    volume: toStr(r.volume),
    largeOrderNet: toStr(r.large_order_net),
    market: r.market || null,
    updatedAt: new Date(),
  }));
  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(hotReason)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [hotReason.date, hotReason.symbol],
        set: {
          name: sql.raw("excluded.name"),
          reason: sql.raw("excluded.reason"),
          close: sql.raw("excluded.close"),
          change: sql.raw("excluded.change"),
          changePercent: sql.raw("excluded.change_percent"),
          turnoverRate: sql.raw("excluded.turnover_rate"),
          amount: sql.raw("excluded.amount"),
          volume: sql.raw("excluded.volume"),
          largeOrderNet: sql.raw("excluded.large_order_net"),
          market: sql.raw("excluded.market"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }
  return values.length;
}

export async function mainlineSignalsPipeRun(): Promise<void> {
  const today = localDateStr();

  // 记录失败的数据源；任一源失败则任务最终标记 failed 触发重试，避免部分源数据当天永久缺失
  const errors: string[] = [];

  let industry5d: BoardFundFlowItem[] = [];
  let concept5d: BoardFundFlowItem[] = [];
  let dragonStocks: DragonTigerStock[] = [];
  let hotRows: HotReasonItem[] = [];

  try {
    console.log("[mainline-signals] fetching industry 5d board fund flow...");
    industry5d = (await quant.boardFundFlow("industry", "5d")).rows;
    console.log(`[mainline-signals] got ${industry5d.length} industry 5d rows`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[mainline-signals] industry 5d fetch failed:", msg);
    errors.push(`industry5d: ${msg}`);
  }

  try {
    console.log("[mainline-signals] fetching concept 5d board fund flow...");
    concept5d = (await quant.boardFundFlow("concept", "5d")).rows;
    console.log(`[mainline-signals] got ${concept5d.length} concept 5d rows`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[mainline-signals] concept 5d fetch failed:", msg);
    errors.push(`concept5d: ${msg}`);
  }

  try {
    console.log("[mainline-signals] fetching daily dragon tiger...");
    dragonStocks = (await quant.dailyDragonTiger(today)).stocks;
    console.log(`[mainline-signals] got ${dragonStocks.length} dragon tiger stocks`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[mainline-signals] dragon tiger fetch failed:", msg);
    errors.push(`dragonTiger: ${msg}`);
  }

  try {
    console.log("[mainline-signals] fetching hot reason...");
    hotRows = await quant.hotReason(today);
    console.log(`[mainline-signals] got ${hotRows.length} hot reason rows`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[mainline-signals] hot reason fetch failed:", msg);
    errors.push(`hotReason: ${msg}`);
  }

  if (
    industry5d.length === 0 &&
    concept5d.length === 0 &&
    dragonStocks.length === 0 &&
    hotRows.length === 0
  ) {
    throw new Error("[mainline-signals] 板块5日资金流/龙虎榜/题材归因均无数据，未写入任何记录");
  }

  // 四个阶段：行业 5d / 概念 5d / 龙虎榜 / 题材归因
  const TOTAL_STAGES = 4;
  updateProgress(0, TOTAL_STAGES, "开始同步主线信号（5日资金流/龙虎榜/题材归因）");

  const industryCount = await upsertBoardFundFlow5d(today, "industry", industry5d);
  updateProgress(1, TOTAL_STAGES, `行业5日资金流完成（${industryCount} 条）`);

  const conceptCount = await upsertBoardFundFlow5d(today, "concept", concept5d);
  updateProgress(2, TOTAL_STAGES, `概念5日资金流完成（${conceptCount} 条）`);

  const dragonCount = await upsertDragonTiger(today, dragonStocks);
  updateProgress(3, TOTAL_STAGES, `龙虎榜完成（${dragonCount} 条）`);

  const hotCount = await upsertHotReason(today, hotRows);
  updateProgress(4, TOTAL_STAGES, `题材归因完成（${hotCount} 条）`);

  console.log(
    `[mainline-signals] done. industry5d: ${industryCount}, concept5d: ${conceptCount}, dragon: ${dragonCount}, hotReason: ${hotCount} (snapshot ${today})`,
  );

  // 成功部分已 upsert（幂等），再抛出失败以让 wrapJob 标记 failed 触发重试，补齐失败源
  if (errors.length > 0) {
    throw new Error(`[mainline-signals] 部分数据源失败（${errors.join("; ")}），已写入成功部分，等待重试`);
  }
}
