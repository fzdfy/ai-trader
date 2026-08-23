import { Hono } from "hono";
import { db } from "../db";
import { board, boardHistory } from "../db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const boardsRoute = new Hono();

// GET /api/v1/boards?type=industry|concept
boardsRoute.get("/", async (c) => {
  const type = c.req.query("type") ?? "industry";

  const rows = await db
    .select()
    .from(board)
    .where(eq(board.type, type))
    .orderBy(board.rank);

  return ok(c, rows);
});

// GET /api/v1/boards/history?code=BK1027&days=30
// 板块排行历史（每日快照，时间倒序）
boardsRoute.get("/history", async (c) => {
  const code = c.req.query("code");
  const days = Math.min(Math.max(Number(c.req.query("days") ?? "30"), 1), 250);

  if (!code) return badRequest(c, "code is required");

  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(boardHistory)
    .where(and(eq(boardHistory.code, code), gte(boardHistory.date, startDate)))
    .orderBy(desc(boardHistory.date));

  return ok(c, rows);
});

// GET /api/v1/boards/history/top?type=industry&days=30&limit=10
// 近 N 日每日涨幅榜（每个交易日涨跌幅排名前 limit 的板块）
boardsRoute.get("/history/top", async (c) => {
  const type = c.req.query("type") ?? "industry";
  const days = Math.min(Math.max(Number(c.req.query("days") ?? "30"), 1), 250);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "10"), 1), 50);

  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(boardHistory)
    .where(and(eq(boardHistory.type, type), gte(boardHistory.date, startDate)))
    .orderBy(desc(boardHistory.date), boardHistory.rank);

  // 按日期分组，取每日前 limit 名
  const byDate = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = String(row.date);
    const list = byDate.get(key) ?? [];
    if (list.length < limit) list.push(row);
    byDate.set(key, list);
  }
  const result = [...byDate.entries()].map(([date, items]) => ({ date, top: items }));
  return ok(c, result);
});

export { boardsRoute };
