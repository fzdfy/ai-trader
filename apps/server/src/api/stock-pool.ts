/**
 * 选股池 API — 挂载于 /api/v1/stock-pool
 *
 * 选股池（落库表）与前端内存的"结果集合"不同：
 *   结果集合 = 前端临时勾选，不落库；选股池 = 从选股结果加入并持久化，支持按日回放。
 *
 * 提供：
 *   POST /        批量加入选股池（同日同标的唯一）
 *   GET  /        回放某交易日选股池
 *   GET  /dates   选股池日期列表
 */
import { Hono } from "hono";
import { db } from "../db";
import { stockPool } from "../db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const stockPoolRoute = new Hono();

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface PoolItem {
  symbol: string;
  name: string;
  source?: string;
  score?: string;
}

// POST /api/v1/stock-pool — 批量加入选股池
stockPoolRoute.post("/", async (c) => {
  const body = (await c.req.json()) as { date?: string; items?: PoolItem[] };
  const date = body.date?.trim() || formatDate(new Date());
  const items = (body.items ?? []).filter((i) => i.symbol && i.name);
  if (items.length === 0) return badRequest(c, "items is required");

  const values = items.map((i) => ({
    date,
    symbol: i.symbol,
    name: i.name,
    source: i.source ?? null,
    score: i.score ?? null,
  }));

  await db
    .insert(stockPool)
    .values(values)
    .onConflictDoUpdate({
      target: [stockPool.date, stockPool.symbol],
      set: {
        name: sql`excluded.name`,
        source: sql`excluded.source`,
        score: sql`excluded.score`,
      },
    });

  return ok(c, { date, count: values.length });
});

// GET /api/v1/stock-pool/dates — 选股池日期列表（倒序）
stockPoolRoute.get("/dates", async (c) => {
  const rows = await db
    .selectDistinct({ date: stockPool.date })
    .from(stockPool)
    .orderBy(desc(stockPool.date));
  return ok(c, rows.map((r) => r.date));
});

// GET /api/v1/stock-pool?date=YYYY-MM-DD — 回放某交易日选股池
stockPoolRoute.get("/", async (c) => {
  const date = c.req.query("date") ?? formatDate(new Date());
  const rows = await db
    .select({
      symbol: stockPool.symbol,
      name: stockPool.name,
      source: stockPool.source,
      score: stockPool.score,
    })
    .from(stockPool)
    .where(eq(stockPool.date, date));
  return ok(c, rows);
});

export { stockPoolRoute };
