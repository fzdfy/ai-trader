/**
 * fundflow 管道 — 同步行业 / 概念 / 个股资金流排行到 fund_flow_rank。
 *
 * 数据源：stock-sdk 东方财富资金流排行接口（收盘后同步为当日快照）：
 *   - industry : fundFlow.sectorRank({ sectorType: "industry" })
 *   - concept  : fundFlow.sectorRank({ sectorType: "concept" })
 *   - stock    : fundFlow.rank()
 *
 * 写入策略：upsert（date + category + code 主键，同日覆盖为当天最后一次同步结果）。
 */

import { createSdk, withSdkRetry } from "../../../lib/sdk";
import { db } from "../../../db";
import { fundFlowRank } from "../../../db/schema";
import { sql } from "drizzle-orm";

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

/** upsert 板块资金流（industry / concept） */
async function upsertSector(
  today: string,
  category: "industry" | "concept",
  rows: SectorRow[],
): Promise<number> {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const values = {
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
      topStockCode: r.topStockCode ?? null,
      topStockName: r.topStockName ?? null,
      updatedAt: new Date(),
    };
    await db
      .insert(fundFlowRank)
      .values(values)
      .onConflictDoUpdate({
        target: [fundFlowRank.date, fundFlowRank.category, fundFlowRank.code],
        set: {
          rank: i + 1,
          name: r.name,
          changePercent: values.changePercent,
          mainNetInflow: values.mainNetInflow,
          mainNetInflowPercent: values.mainNetInflowPercent,
          superLargeNetInflow: values.superLargeNetInflow,
          largeNetInflow: values.largeNetInflow,
          mediumNetInflow: values.mediumNetInflow,
          smallNetInflow: values.smallNetInflow,
          price: null,
          topStockCode: values.topStockCode,
          topStockName: values.topStockName,
          updatedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}

/** upsert 个股资金流 */
async function upsertStock(today: string, rows: StockRow[]): Promise<number> {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const values = {
      date: today,
      category: "stock" as const,
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
      price: toStr(r.price),
      topStockCode: null,
      topStockName: null,
      updatedAt: new Date(),
    };
    await db
      .insert(fundFlowRank)
      .values(values)
      .onConflictDoUpdate({
        target: [fundFlowRank.date, fundFlowRank.category, fundFlowRank.code],
        set: {
          rank: i + 1,
          name: r.name,
          changePercent: values.changePercent,
          mainNetInflow: values.mainNetInflow,
          mainNetInflowPercent: values.mainNetInflowPercent,
          superLargeNetInflow: values.superLargeNetInflow,
          largeNetInflow: values.largeNetInflow,
          mediumNetInflow: values.mediumNetInflow,
          smallNetInflow: values.smallNetInflow,
          price: values.price,
          topStockCode: null,
          topStockName: null,
          updatedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}

export async function fundFlowPipeRun(): Promise<void> {
  const sdk = createSdk();
  const today = new Date().toISOString().slice(0, 10);

  let industries: SectorRow[] = [];
  let concepts: SectorRow[] = [];
  let stocks: StockRow[] = [];

  try {
    console.log("[fundflow] fetching industry sector fund flow...");
    industries = await withSdkRetry(
      () => sdk.fundFlow.sectorRank({ sectorType: "industry", indicator: "today" }),
      { label: "fundflow.industry" },
    );
    console.log(`[fundflow] got ${industries.length} industry rows`);
  } catch (error) {
    console.error("[fundflow] industry fetch failed (skip):", (error as Error).message ?? error);
  }

  try {
    console.log("[fundflow] fetching concept sector fund flow...");
    concepts = await withSdkRetry(
      () => sdk.fundFlow.sectorRank({ sectorType: "concept", indicator: "today" }),
      { label: "fundflow.concept" },
    );
    console.log(`[fundflow] got ${concepts.length} concept rows`);
  } catch (error) {
    console.error("[fundflow] concept fetch failed (skip):", (error as Error).message ?? error);
  }

  try {
    console.log("[fundflow] fetching stock fund flow rank...");
    stocks = await withSdkRetry(() => sdk.fundFlow.rank({ indicator: "today" }), {
      label: "fundflow.stock",
    });
    console.log(`[fundflow] got ${stocks.length} stock rows`);
  } catch (error) {
    console.error("[fundflow] stock fetch failed (skip):", (error as Error).message ?? error);
  }

  const industryCount = await upsertSector(today, "industry", industries);
  const conceptCount = await upsertSector(today, "concept", concepts);
  const stockCount = await upsertStock(today, stocks);

  console.log(
    `[fundflow] done. industry: ${industryCount}, concept: ${conceptCount}, stock: ${stockCount} (snapshot ${today})`,
  );
}
