/**
 * 资金流向 API。
 *
 * 提供：
 *   GET /api/v1/fundflow/rank?category=industry|concept|stock&page=1&page_size=50
 *       资金流排行（行业 / 概念 / 个股），从 fund_flow_rank 表读取最新快照，SQL 分页。
 *   GET /api/v1/fundflow?symbol=xxx&limit=30        个股资金流历史（120 交易日，实时 quant）
 *   GET /api/v1/fundflow/board?board_code=BKxxxx    单板块（行业/概念）资金流历史（实时 quant）
 */

import { Hono } from "hono";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { fundFlowRank } from "../db/schema";
import { quant } from "../lib/quant";
import { ok, badRequest, paginated } from "../lib/response";

const fundflowRoute = new Hono();

/** drizzle numeric 返回 string → number | null */
function n(v: unknown): number | null {
  if (v == null) return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

/** 个股资金流日级（前端图表所需 camelCase 结构） */
interface FundFlowDailyMapped {
  date: string;
  close: number | null;
  changePercent: number | null;
  mainNetInflow: number;
  superLargeNetInflow: number;
  largeNetInflow: number;
  mediumNetInflow: number;
  smallNetInflow: number;
}

function mapDaily(r: {
  date: string;
  close: number | null;
  change_pct: number | null;
  main_net: number;
  super_net: number;
  large_net: number;
  mid_net: number;
  small_net: number;
}): FundFlowDailyMapped {
  return {
    date: r.date,
    close: r.close,
    changePercent: r.change_pct,
    mainNetInflow: r.main_net,
    superLargeNetInflow: r.super_net,
    largeNetInflow: r.large_net,
    mediumNetInflow: r.mid_net,
    smallNetInflow: r.small_net,
  };
}

// GET /api/v1/fundflow/rank?category=industry|concept|stock&page=1&page_size=50 — 资金流排行（查库分页）
fundflowRoute.get("/rank", async (c) => {
  const category = c.req.query("category") ?? "industry";
  if (!["industry", "concept", "stock"].includes(category)) {
    return badRequest(c, "category must be industry|concept|stock");
  }
  const page = Math.max(Number(c.req.query("page") ?? "1"), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query("page_size") ?? "50"), 1), 100);

  try {
    // 该分类最新快照日期
    const [latest] = await db
      .selectDistinct({ date: fundFlowRank.date })
      .from(fundFlowRank)
      .where(eq(fundFlowRank.category, category))
      .orderBy(desc(fundFlowRank.date))
      .limit(1);
    const date = latest?.date ?? null;
    if (!date) return paginated(c, [], 0, page, pageSize);

    const where = and(eq(fundFlowRank.category, category), eq(fundFlowRank.date, date));

    const [cnt] = await db.select({ count: count() }).from(fundFlowRank).where(where);
    const total = cnt?.count ?? 0;

    const rows = await db
      .select()
      .from(fundFlowRank)
      .where(where)
      .orderBy(fundFlowRank.rank)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return paginated(
      c,
      rows.map((r) => ({
        rank: r.rank,
        code: r.code,
        name: r.name,
        price: n(r.price),
        changePercent: n(r.changePercent),
        mainNetInflow: n(r.mainNetInflow),
        mainNetInflowPercent: n(r.mainNetInflowPercent),
        superLargeNetInflow: n(r.superLargeNetInflow),
        largeNetInflow: n(r.largeNetInflow),
        mediumNetInflow: n(r.mediumNetInflow),
        smallNetInflow: n(r.smallNetInflow),
        topStockCode: r.topStockCode,
        topStockName: r.topStockName,
      })),
      total,
      page,
      pageSize,
    );
  } catch (error) {
    console.error(`[fundflow] rank ${category} failed:`, error);
    return paginated(c, [], 0, page, pageSize);
  }
});

// GET /api/v1/fundflow/board?board_code=BK0475&limit=30 — 单板块（行业/概念）资金流历史
fundflowRoute.get("/board", async (c) => {
  const boardCode = c.req.query("board_code");
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "30"), 1), 120);
  if (!boardCode) return badRequest(c, "board_code is required");

  try {
    const rows = await quant.fundFlow120d(boardCode);
    const mapped = rows.slice(-limit).map(mapDaily);
    return ok(c, mapped);
  } catch (error) {
    console.error(`[fundflow] board ${boardCode} failed:`, error);
    return ok(c, []);
  }
});

// GET /api/v1/fundflow?symbol=002594.SZ&period=daily&limit=30 — 个股资金流历史
fundflowRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const period = c.req.query("period") ?? "daily";
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "30"), 1), 120);

  if (!symbol) return badRequest(c, "symbol is required");
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return badRequest(c, "period must be daily|weekly|monthly");
  }

  try {
    const rows = await quant.fundFlow120d(symbol);
    // quant 仅提供日级资金流（最近 120 个交易日），映射 snake_case → 前端 camelCase
    const mapped = rows.slice(-limit).map(mapDaily);
    return ok(c, mapped);
  } catch (error) {
    console.error(`[fundflow] ${symbol} failed:`, error);
    return ok(c, []);
  }
});

export { fundflowRoute };
