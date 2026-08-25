/**
 * 热力图 API — 板块热力图数据（双层 treemap）。
 *
 * 结构：一级 = 板块（面积=总市值），二级 children = 成分股（面积=成交额），
 * 一张图内直接嵌套展示，颜色均按涨跌幅（红涨绿跌）。
 *
 * 数据流（纯查库）：
 *   一级板块读 board 表，二级成分股读 board_constituent 表，
 *   两块数据均由同步管道（boards / constituents）在收盘后落库，接口不实时拉上游。
 *
 * 说明：A 股无官方 GICS 分类数据源，本接口按东财行业/概念分类返回，
 * 效果等同 GICS 风格热力图（finviz 市场地图）。
 */

import { Hono } from "hono";
import { db } from "../db";
import { board, boardConstituent } from "../db/schema";
import { and, asc, eq } from "drizzle-orm";
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

/** 把 DB 的 board 行转成 BoardNode */
function toBoardNode(row: typeof board.$inferSelect): BoardNode {
  return {
    name: row.name,
    code: row.code,
    changePercent: row.changePercent != null ? Number.parseFloat(row.changePercent) : null,
    totalMarketCap: row.totalMarketCap != null ? Number.parseFloat(row.totalMarketCap) : null,
    turnoverRate: row.popularity != null ? Number.parseFloat(row.popularity) : null,
    leadingStock: row.leader,
    leadingStockChangePercent:
      row.leaderChange != null ? Number.parseFloat(row.leaderChange) : null,
  };
}

/** 把 DB 的 board_constituent 行转成 StockNode */
function toStockNode(row: typeof boardConstituent.$inferSelect): StockNode {
  return {
    name: row.name,
    code: row.symbol,
    value: row.amount != null ? Number.parseFloat(row.amount) : 0,
    changePercent: row.changePercent != null ? Number.parseFloat(row.changePercent) : null,
    turnoverRate: row.turnoverRate != null ? Number.parseFloat(row.turnoverRate) : null,
  };
}

// GET /api/v1/heatmap?type=industry|concept&top=200
heatmapRoute.get("/", async (c) => {
  const type = c.req.query("type") ?? "industry";
  const top = Math.min(Math.max(Number(c.req.query("top") ?? "200"), 5), 300);
  if (type !== "industry" && type !== "concept") {
    return badRequest(c, "type must be industry|concept");
  }

  const boardRows = await db
    .select()
    .from(board)
    .where(eq(board.type, type))
    .orderBy(asc(board.rank))
    .limit(top);

  if (boardRows.length === 0) {
    return ok(c, { type, total: 0, source: "db", data: [] });
  }

  const topBoards = boardRows.map(toBoardNode);

  // 成分股按板块分组（一次查询全部类型成分股，再按板块代码映射）
  const constituentRows = await db
    .select()
    .from(boardConstituent)
    .where(eq(boardConstituent.type, type));

  const dbMap = new Map<string, StockNode[]>();
  for (const r of constituentRows) {
    const list = dbMap.get(r.boardCode) ?? [];
    list.push(toStockNode(r));
    dbMap.set(r.boardCode, list);
  }

  // 组装嵌套结构
  const data = topBoards.map((item) => ({
    name: item.name,
    code: item.code,
    // 板块面积：优先总市值；缺失时用换手率近似
    value: item.totalMarketCap ?? (item.turnoverRate != null ? item.turnoverRate * 1e6 : 0),
    changePercent: item.changePercent,
    turnoverRate: item.turnoverRate,
    leadingStock: item.leadingStock,
    leadingStockChangePercent: item.leadingStockChangePercent,
    children: dbMap.get(item.code) ?? [],
  }));

  return ok(c, { type, total: data.length, source: "db", data });
});

/**
 * GET /api/v1/heatmap/board?type=industry|concept&code=BK1027
 *
 * 单个板块的成分股热力图数据（点击板块下钻用），纯查库。
 */
heatmapRoute.get("/board", async (c) => {
  const type = c.req.query("type") ?? "industry";
  const code = c.req.query("code") ?? "";
  if ((type !== "industry" && type !== "concept") || !code) {
    return badRequest(c, "type must be industry|concept and code required");
  }

  const rows = await db
    .select()
    .from(boardConstituent)
    .where(and(eq(boardConstituent.type, type), eq(boardConstituent.boardCode, code)));

  const data: StockNode[] = rows.map(toStockNode);

  return ok(c, { code, source: "db", data });
});

export { heatmapRoute };
