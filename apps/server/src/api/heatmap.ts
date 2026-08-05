/**
 * 热力图 API — 板块热力图数据（双层 treemap）。
 *
 * 结构：一级 = 板块（面积=总市值），二级 children = 成分股（面积=成交额），
 * 一张图内直接嵌套展示，颜色均按涨跌幅（红涨绿跌）。
 *
 * 数据源优先级：
 *   1. stock-sdk 东方财富行业/概念板块实时列表（含总市值）+ 成分股
 *   2. 上游失败 / 返回空 → 从 board 表兜底查询一级板块（成分股无缓存，留空）
 *
 * 说明：A 股无官方 GICS 分类数据源，本接口按东财行业/概念分类返回，
 * 效果等同 GICS 风格热力图（finviz 市场地图）。
 */

import { Hono } from "hono";
import { StockSDK } from "stock-sdk";
import { db } from "../db";
import { board } from "../db/schema";
import { eq } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const heatmapRoute = new Hono();

interface BoardNode {
  name: string;
  code: string;
  changePercent: number | null;
  totalMarketCap: number | null;
  turnoverRate: number | null;
  leadingStock: string | null;
  leadingStockChangePercent: number | null;
}

interface StockNode {
  name: string;
  code: string;
  value: number;
  changePercent: number | null;
  turnoverRate: number | null;
}

/** 分批并发执行，避免大量请求同时打到上游；超时后放弃剩余批次 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    if (Date.now() > deadline) {
      console.warn(
        `[heatmap] constituents fetch timeout, skipped remaining ${items.length - results.length} boards`,
      );
      break;
    }
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

// GET /api/v1/heatmap?type=industry|concept&top=20
heatmapRoute.get("/", async (c) => {
  const type = c.req.query("type") ?? "industry";
  const top = Math.min(Math.max(Number(c.req.query("top") ?? "200"), 5), 300);
  if (type !== "industry" && type !== "concept") {
    return badRequest(c, "type must be industry|concept");
  }

  const sdk = new StockSDK();

  // 1. 一级板块：优先实时拉取，失败/为空从 DB 兜底
  let list: BoardNode[] = [];
  let source = "eastmoney";
  try {
    const rows =
      type === "industry" ? await sdk.board.industry.list() : await sdk.board.concept.list();
    list = rows.map((item) => ({
      name: item.name,
      code: item.code,
      changePercent: item.changePercent,
      totalMarketCap: item.totalMarketCap,
      turnoverRate: item.turnoverRate,
      leadingStock: item.leadingStock,
      leadingStockChangePercent: item.leadingStockChangePercent,
    }));
  } catch (error) {
    console.error(
      `[heatmap] ${type} eastmoney failed, fallback to db:`,
      (error as Error).message ?? error,
    );
  }

  if (list.length === 0) {
    const rows = await db
      .select({
        code: board.code,
        name: board.name,
        changePercent: board.changePercent,
        totalMarketCap: board.totalMarketCap,
        popularity: board.popularity,
      })
      .from(board)
      .where(eq(board.type, type))
      .orderBy(board.rank);

    list = rows.map((r) => ({
      name: r.name,
      code: r.code,
      changePercent: r.changePercent != null ? Number.parseFloat(r.changePercent) : null,
      totalMarketCap: r.totalMarketCap != null ? Number.parseFloat(r.totalMarketCap) : null,
      turnoverRate: r.popularity != null ? Number.parseFloat(r.popularity) : null,
      leadingStock: null,
      leadingStockChangePercent: null,
    }));
    source = "db";
  }

  // 2. 只取排名前 top 个板块（控制节点量，保证渲染性能）
  const topBoards = list.slice(0, top);

  // 3. 拉取各板块成分股（分批并发 5，失败置空）
  //    仅当一级数据来自实时接口；DB 兜底说明上游不可达，跳过避免卡死
  const constituentsMap = new Map<string, StockNode[]>();
  if (source === "eastmoney") {
    const deadline = Date.now() + 15_000; // 成分股总拉取时限 15s
    await mapWithConcurrency(topBoards, 5, deadline, async (b) => {
      try {
        const rows =
          type === "industry"
            ? await sdk.board.industry.constituents(b.code)
            : await sdk.board.concept.constituents(b.code);
        constituentsMap.set(
          b.code,
          rows.map((s) => ({
            name: s.name,
            code: s.code,
            // 面积：成交额（成分股接口无总市值字段）
            value: s.amount ?? 0,
            changePercent: s.changePercent,
            turnoverRate: s.turnoverRate,
          })),
        );
      } catch (error) {
        console.error(
          `[heatmap] constituents ${b.code} failed (skip):`,
          (error as Error).message ?? error,
        );
        constituentsMap.set(b.code, []);
      }
    });
  }

  // 4. 组装嵌套结构
  const data = topBoards.map((item) => ({
    name: item.name,
    code: item.code,
    // 板块面积：优先总市值；缺失时用换手率近似
    value: item.totalMarketCap ?? (item.turnoverRate != null ? item.turnoverRate * 1e6 : 0),
    changePercent: item.changePercent,
    turnoverRate: item.turnoverRate,
    leadingStock: item.leadingStock,
    leadingStockChangePercent: item.leadingStockChangePercent,
    children: constituentsMap.get(item.code) ?? [],
  }));

  return ok(c, { type, total: data.length, source, data });
});

export { heatmapRoute };
