/**
 * fundflow 管道 — 同步行业 / 概念 / 个股资金流排行到 fund_flow_rank。
 *
 * 数据源：quant 数据服务东方财富资金流排行接口（收盘后同步为当日快照）：
 *   - industry : quant.boardFundFlow("industry", "today")
 *   - concept  : quant.boardFundFlow("concept", "today")
 *   - stock    : quant.fundFlowRank()
 *
 * 写入策略：upsert（date + category + code 主键，同日覆盖为当天最后一次同步结果）。
 */

import { quant } from "../../../lib/quant";
import { db } from "../../../db";
import { fundFlowRank } from "../../../db/schema";
import { sql } from "drizzle-orm";
import { updateProgress } from "../progress";
import { getSyncTradeDate } from "../calendar";

/** 板块资金流排行项（industry / concept 共用） */
interface SectorRow {
  code: string;
  name: string;
  changePercent: number | null;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
  superLargeNetInflow: number | null;
  largeNetInflow: number | null;
  mediumNetInflow: number | null;
  smallNetInflow: number | null;
  topStockCode?: string;
  topStockName?: string;
}

/** 个股资金流排行项 */
interface StockRow {
  code: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  mainNetInflow: number | null;
  mainNetInflowPercent: number | null;
  superLargeNetInflow: number | null;
  largeNetInflow: number | null;
  mediumNetInflow: number | null;
  smallNetInflow: number | null;
}

/** 数值统一为 string | null，与 drizzle numeric 列的插入类型保持一致 */
function toStr(v: number | null | undefined): string | null {
  return v == null ? null : String(v);
}

/** 东财原始 6 位代码 → 标准 symbol（60x/68x→.SH，00x/30x→.SZ，43/83/87/88/92→.BJ，已含后缀则原样） */
function codeToSymbol(code: string): string {
  if (code.includes(".")) return code;
  if (/^(60|68)/.test(code)) return `${code}.SH`;
  if (/^(00|30)/.test(code)) return `${code}.SZ`;
  if (/^(43|83|87|88|92)/.test(code)) return `${code}.BJ`;
  return `${code}.SH`;
}

/** upsert 板块资金流（industry / concept） */
async function upsertSector(
  today: string,
  category: "industry" | "concept",
  rows: SectorRow[],
): Promise<number> {
  const values = rows.map((r, i) => ({
    date: today,
    category,
    rank: i + 1,
    code: r.code,
    name: r.name,
    changePercent: toStr(r.changePercent),
    mainNetInflow: toStr(r.mainNetInflow),
    mainNetInflowPercent: toStr(r.mainNetInflowPercent),
    superLargeNetInflow: toStr(r.superLargeNetInflow),
    largeNetInflow: toStr(r.largeNetInflow),
    mediumNetInflow: toStr(r.mediumNetInflow),
    smallNetInflow: toStr(r.smallNetInflow),
    price: null,
    topStockCode: r.topStockCode ? codeToSymbol(r.topStockCode) : null,
    topStockName: r.topStockName ?? null,
    updatedAt: new Date(),
  }));
  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(fundFlowRank)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [fundFlowRank.date, fundFlowRank.category, fundFlowRank.code],
        set: {
          rank: sql.raw("excluded.rank"),
          name: sql.raw("excluded.name"),
          changePercent: sql.raw("excluded.change_percent"),
          mainNetInflow: sql.raw("excluded.main_net_inflow"),
          mainNetInflowPercent: sql.raw("excluded.main_net_inflow_percent"),
          superLargeNetInflow: sql.raw("excluded.super_large_net_inflow"),
          largeNetInflow: sql.raw("excluded.large_net_inflow"),
          mediumNetInflow: sql.raw("excluded.medium_net_inflow"),
          smallNetInflow: sql.raw("excluded.small_net_inflow"),
          price: sql.raw("excluded.price"),
          topStockCode: sql.raw("excluded.top_stock_code"),
          topStockName: sql.raw("excluded.top_stock_name"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }
  return values.length;
}

/** upsert 个股资金流 */
async function upsertStock(today: string, rows: StockRow[]): Promise<number> {
  const values = rows.map((r, i) => ({
    date: today,
    category: "stock" as const,
    rank: i + 1,
    code: codeToSymbol(r.code),
    name: r.name,
    changePercent: toStr(r.changePercent),
    mainNetInflow: toStr(r.mainNetInflow),
    mainNetInflowPercent: toStr(r.mainNetInflowPercent),
    superLargeNetInflow: toStr(r.superLargeNetInflow),
    largeNetInflow: toStr(r.largeNetInflow),
    mediumNetInflow: toStr(r.mediumNetInflow),
    smallNetInflow: toStr(r.smallNetInflow),
    price: toStr(r.price),
    topStockCode: null,
    topStockName: null,
    updatedAt: new Date(),
  }));
  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(fundFlowRank)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [fundFlowRank.date, fundFlowRank.category, fundFlowRank.code],
        set: {
          rank: sql.raw("excluded.rank"),
          name: sql.raw("excluded.name"),
          changePercent: sql.raw("excluded.change_percent"),
          mainNetInflow: sql.raw("excluded.main_net_inflow"),
          mainNetInflowPercent: sql.raw("excluded.main_net_inflow_percent"),
          superLargeNetInflow: sql.raw("excluded.super_large_net_inflow"),
          largeNetInflow: sql.raw("excluded.large_net_inflow"),
          mediumNetInflow: sql.raw("excluded.medium_net_inflow"),
          smallNetInflow: sql.raw("excluded.small_net_inflow"),
          price: sql.raw("excluded.price"),
          topStockCode: sql.raw("excluded.top_stock_code"),
          topStockName: sql.raw("excluded.top_stock_name"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }
  return values.length;
}

export async function fundFlowPipeRun(): Promise<void> {
  const today = await getSyncTradeDate();
  if (!today) throw new Error("[fundflow] 无可用交易日（交易日历为空或异常）");

  // 记录失败的数据源；任一源失败则任务最终标记 failed 触发重试，避免部分源数据当天永久缺失
  const errors: string[] = [];

  let industries: SectorRow[] = [];
  let concepts: SectorRow[] = [];
  let stocks: StockRow[] = [];

  try {
    console.log("[fundflow] fetching industry sector fund flow...");
    industries = (await quant.boardFundFlow("industry", "today")).rows.map((r) => ({
      code: r.code,
      name: r.name,
      changePercent: r.change_pct,
      mainNetInflow: r.main_net,
      mainNetInflowPercent: r.main_pct,
      superLargeNetInflow: r.super_large_net,
      largeNetInflow: r.large_net,
      mediumNetInflow: r.medium_net,
      smallNetInflow: r.small_net,
      topStockCode: r.top_stock_code,
      topStockName: r.top_stock_name,
    }));
    console.log(`[fundflow] got ${industries.length} industry rows`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[fundflow] industry fetch failed:", msg);
    errors.push(`industry: ${msg}`);
  }

  try {
    console.log("[fundflow] fetching concept sector fund flow...");
    concepts = (await quant.boardFundFlow("concept", "today")).rows.map((r) => ({
      code: r.code,
      name: r.name,
      changePercent: r.change_pct,
      mainNetInflow: r.main_net,
      mainNetInflowPercent: r.main_pct,
      superLargeNetInflow: r.super_large_net,
      largeNetInflow: r.large_net,
      mediumNetInflow: r.medium_net,
      smallNetInflow: r.small_net,
      topStockCode: r.top_stock_code,
      topStockName: r.top_stock_name,
    }));
    console.log(`[fundflow] got ${concepts.length} concept rows`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[fundflow] concept fetch failed:", msg);
    errors.push(`concept: ${msg}`);
  }

  try {
    console.log("[fundflow] fetching stock fund flow rank...");
    stocks = (await quant.fundFlowRank()).map((r) => ({
      code: r.code,
      name: r.name,
      price: r.price,
      changePercent: r.change_pct,
      mainNetInflow: r.main_net,
      mainNetInflowPercent: r.main_pct,
      superLargeNetInflow: r.super_large_net,
      largeNetInflow: r.large_net,
      mediumNetInflow: r.medium_net,
      smallNetInflow: r.small_net,
    }));
    console.log(`[fundflow] got ${stocks.length} stock rows`);
  } catch (error) {
    const msg = (error as Error).message ?? String(error);
    console.error("[fundflow] stock fetch failed:", msg);
    errors.push(`stock: ${msg}`);
  }

  if (industries.length === 0 && concepts.length === 0 && stocks.length === 0) {
    throw new Error("[fundflow] 行业/概念/个股资金流均无数据，未写入任何记录");
  }

  // 三个阶段：行业 / 概念 / 个股
  const TOTAL_STAGES = 3;
  updateProgress(0, TOTAL_STAGES, "开始同步资金流排行");

  const industryCount = await upsertSector(today, "industry", industries);
  updateProgress(1, TOTAL_STAGES, `行业资金流完成（${industryCount} 条）`);

  const conceptCount = await upsertSector(today, "concept", concepts);
  updateProgress(2, TOTAL_STAGES, `概念资金流完成（${conceptCount} 条）`);

  const stockCount = await upsertStock(today, stocks);
  updateProgress(3, TOTAL_STAGES, `个股资金流完成（${stockCount} 条）`);

  console.log(
    `[fundflow] done. industry: ${industryCount}, concept: ${conceptCount}, stock: ${stockCount} (snapshot ${today})`,
  );

  // 成功部分已 upsert（幂等），再抛出失败以让 wrapJob 标记 failed 触发重试，补齐失败源
  if (errors.length > 0) {
    throw new Error(`[fundflow] 部分数据源失败（${errors.join("; ")}），已写入成功部分，等待重试`);
  }
}
