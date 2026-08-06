/**
 * 热力图 API — 板块热力图数据（双层 treemap）。
 *
 * 结构：一级 = 板块（面积=总市值），二级 children = 成分股（面积=成交额），
 * 一张图内直接嵌套展示，颜色均按涨跌幅（红涨绿跌）。
 *
 * 数据流（DB 优先，避免每次都打上游）：
 *   1. 从 DB 查询一级板块（board 表）与二级成分股（board_constituent 表）
 *   2. DB 无板块数据 → 实时拉取板块（stock-sdk），成功后 upsert 到 board
 *   3. 板块有、成分股缺失 → 实时拉取成分股，成功后 upsert 到 board_constituent
 *   4. 实时拉取带总时限保护（15s），超时放弃剩余
 *
 * 说明：A 股无官方 GICS 分类数据源，本接口按东财行业/概念分类返回，
 * 效果等同 GICS 风格热力图（finviz 市场地图）。
 */

import { Hono } from "hono";
import { StockSDK } from "stock-sdk";
import { db } from "../db";
import { board, boardConstituent } from "../db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const heatmapRoute = new Hono();

/** 成分股实时拉取失败的板块：短时内不重试（失败冷却 5 分钟），避免上游不可达时接口每次都卡 */
const FAIL_RETRY_MS = 5 * 60_000;
const failedBoards = new Map<string, number>();

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

/** 分批并发执行；超时后放弃剩余批次，避免上游不可达时卡死 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    if (Date.now() > deadline) {
      console.warn(`[heatmap] constituents fetch timeout, skipped remaining ${items.length - results.length} boards`);
      break;
    }
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

/** 把 DB 的 board 行转成 BoardNode */
function toBoardNode(row: typeof board.$inferSelect): BoardNode {
  return {
    name: row.name,
    code: row.code,
    changePercent: row.changePercent != null ? Number.parseFloat(row.changePercent) : null,
    totalMarketCap: row.totalMarketCap != null ? Number.parseFloat(row.totalMarketCap) : null,
    turnoverRate: row.popularity != null ? Number.parseFloat(row.popularity) : null,
    leadingStock: null,
    leadingStockChangePercent: null,
  };
}

// GET /api/v1/heatmap?type=industry|concept&top=200
heatmapRoute.get("/", async (c) => {
  const type = c.req.query("type") ?? "industry";
  const top = Math.min(Math.max(Number(c.req.query("top") ?? "200"), 5), 300);
  if (type !== "industry" && type !== "concept") {
    return badRequest(c, "type must be industry|concept");
  }

  const sdk = new StockSDK();
  let source = "db";

  // 1. DB 优先：板块
  let boards: BoardNode[] = (
    await db
      .select()
      .from(board)
      .where(eq(board.type, type))
      .orderBy(asc(board.rank))
      .limit(top)
  ).map(toBoardNode);

  // 2. DB 无板块 → 实时拉取并落库
  if (boards.length === 0) {
    try {
      const rows =
        type === "industry" ? await sdk.board.industry.list() : await sdk.board.concept.list();
      const fetched: BoardNode[] = rows.map((item) => ({
        name: item.name,
        code: item.code,
        changePercent: item.changePercent,
        totalMarketCap: item.totalMarketCap,
        turnoverRate: item.turnoverRate,
        leadingStock: item.leadingStock,
        leadingStockChangePercent: item.leadingStockChangePercent,
      }));
      if (fetched.length > 0) {
        // 落库 board（upsert），同时写当日历史快照由 boards 管道负责，这里只写最新
        for (const b of fetched) {
          await db
            .insert(board)
            .values({
              code: b.code,
              type,
              name: b.name,
              rank: String(fetched.indexOf(b) + 1),
              changePercent: b.changePercent != null ? String(b.changePercent) : null,
              popularity: b.turnoverRate != null ? String(b.turnoverRate) : null,
              totalMarketCap: b.totalMarketCap != null ? String(b.totalMarketCap) : null,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: board.code,
              set: {
                type,
                name: b.name,
                rank: String(fetched.indexOf(b) + 1),
                changePercent: b.changePercent != null ? String(b.changePercent) : null,
                popularity: b.turnoverRate != null ? String(b.turnoverRate) : null,
                totalMarketCap: b.totalMarketCap != null ? String(b.totalMarketCap) : null,
                updatedAt: sql`now()`,
              },
            });
        }
        boards = fetched.slice(0, top);
        source = "eastmoney";
      }
    } catch (error) {
      console.error(`[heatmap] ${type} eastmoney board fetch failed:`, (error as Error).message ?? error);
    }
  }

  const topBoards = boards.slice(0, top);
  if (topBoards.length === 0) {
    return ok(c, { type, total: 0, source, data: [] });
  }

  // 3. DB 优先：成分股（按板块批量查询）
  const dbRows = await db
    .select()
    .from(boardConstituent)
    .where(eq(boardConstituent.type, type));
  const dbMap = new Map<string, StockNode[]>();
  for (const r of dbRows) {
    const list = dbMap.get(r.boardCode) ?? [];
    list.push({
      name: r.name,
      code: r.symbol,
      value: r.amount != null ? Number.parseFloat(r.amount) : 0,
      changePercent: r.changePercent != null ? Number.parseFloat(r.changePercent) : null,
      turnoverRate: r.turnoverRate != null ? Number.parseFloat(r.turnoverRate) : null,
    });
    dbMap.set(r.boardCode, list);
  }

  // 4. 成分股缺失的板块 → 实时拉取并落库（近期失败过的跳过）
  const missingBoards = topBoards.filter((b) => {
    if ((dbMap.get(b.code)?.length ?? 0) > 0) return false;
    const lastFail = failedBoards.get(b.code);
    return lastFail === undefined || Date.now() - lastFail > FAIL_RETRY_MS;
  });
  if (missingBoards.length > 0) {
    const deadline = Date.now() + 15_000; // 总时限 15s
    await mapWithConcurrency(missingBoards, 5, deadline, async (b) => {
      try {
        const rows =
          type === "industry"
            ? await sdk.board.industry.constituents(b.code)
            : await sdk.board.concept.constituents(b.code);
        const stocks: StockNode[] = rows.map((s) => ({
          name: s.name,
          code: s.code,
          // 面积：成交额（成分股接口无总市值字段）
          value: s.amount ?? 0,
          changePercent: s.changePercent,
          turnoverRate: s.turnoverRate,
        }));
        dbMap.set(b.code, stocks);
        failedBoards.delete(b.code);

        // 落库 board_constituent（upsert 绑定关系 + 行情快照）
        for (const s of stocks) {
          await db
            .insert(boardConstituent)
            .values({
              boardCode: b.code,
              type,
              symbol: s.code,
              name: s.name,
              changePercent: s.changePercent != null ? String(s.changePercent) : null,
              turnoverRate: s.turnoverRate != null ? String(s.turnoverRate) : null,
              amount: s.value != null && s.value > 0 ? String(s.value) : null,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [boardConstituent.boardCode, boardConstituent.symbol],
              set: {
                type,
                name: s.name,
                changePercent: s.changePercent != null ? String(s.changePercent) : null,
                turnoverRate: s.turnoverRate != null ? String(s.turnoverRate) : null,
                amount: s.value != null && s.value > 0 ? String(s.value) : null,
                updatedAt: sql`now()`,
              },
            });
        }
        if (stocks.length > 0) source = "eastmoney";
      } catch (error) {
        console.error(`[heatmap] constituents ${b.code} failed (skip):`, (error as Error).message ?? error);
        failedBoards.set(b.code, Date.now());
        dbMap.set(b.code, []);
      }
    });
  }

  // 5. 组装嵌套结构
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

  return ok(c, { type, total: data.length, source, data });
});

/**
 * GET /api/v1/heatmap/board?type=industry|concept&code=BK1027
 *
 * 单个板块的成分股热力图数据（点击板块下钻用）。
 * 数据流与主接口一致：DB 优先 → 实时拉取并落库。
 */
heatmapRoute.get("/board", async (c) => {
  const type = c.req.query("type") ?? "industry";
  const code = c.req.query("code") ?? "";
  if ((type !== "industry" && type !== "concept") || !code) {
    return badRequest(c, "type must be industry|concept and code required");
  }

  const sdk = new StockSDK();

  // 1. DB 优先
  const dbRows = await db
    .select()
    .from(boardConstituent)
    .where(and(eq(boardConstituent.type, type), eq(boardConstituent.boardCode, code)));
  if (dbRows.length > 0) {
    const stocks: StockNode[] = dbRows.map((r) => ({
      name: r.name,
      code: r.symbol,
      value: r.amount != null ? Number.parseFloat(r.amount) : 0,
      changePercent: r.changePercent != null ? Number.parseFloat(r.changePercent) : null,
      turnoverRate: r.turnoverRate != null ? Number.parseFloat(r.turnoverRate) : null,
    }));
    return ok(c, { code, source: "db", data: stocks });
  }

  // 2. DB 无 → 实时拉取（冷却期内不重试，避免上游不可达时接口卡顿）
  const lastFail = failedBoards.get(code);
  if (lastFail !== undefined && Date.now() - lastFail < FAIL_RETRY_MS) {
    return ok(c, { code, source: "eastmoney", data: [] });
  }
  try {
    const rows =
      type === "industry"
        ? await sdk.board.industry.constituents(code)
        : await sdk.board.concept.constituents(code);
    const stocks: StockNode[] = rows.map((s) => ({
      name: s.name,
      code: s.code,
      value: s.amount ?? 0,
      changePercent: s.changePercent,
      turnoverRate: s.turnoverRate,
    }));
    failedBoards.delete(code);

    // 落库（绑定板块-成分股关系）
    for (const s of stocks) {
      await db
        .insert(boardConstituent)
        .values({
          boardCode: code,
          type,
          symbol: s.code,
          name: s.name,
          changePercent: s.changePercent != null ? String(s.changePercent) : null,
          turnoverRate: s.turnoverRate != null ? String(s.turnoverRate) : null,
          amount: s.value != null && s.value > 0 ? String(s.value) : null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [boardConstituent.boardCode, boardConstituent.symbol],
          set: {
            type,
            name: s.name,
            changePercent: s.changePercent != null ? String(s.changePercent) : null,
            turnoverRate: s.turnoverRate != null ? String(s.turnoverRate) : null,
            amount: s.value != null && s.value > 0 ? String(s.value) : null,
            updatedAt: sql`now()`,
          },
        });
    }
    return ok(c, { code, source: stocks.length > 0 ? "eastmoney" : "db", data: stocks });
  } catch (error) {
    console.error(`[heatmap] board constituents ${code} failed:`, (error as Error).message ?? error);
    failedBoards.set(code, Date.now());
    return ok(c, { code, source: "eastmoney", data: [] });
  }
});

export { heatmapRoute };
