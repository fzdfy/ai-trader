import { Hono } from "hono";
import { db } from "../db";
import { bar1mAdj, bar1dAdj } from "../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const klineRoute = new Hono();

klineRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const tf = c.req.query("tf") ?? "1d";
  const start = c.req.query("start");
  const end = c.req.query("end");
  // const limit = Math.min(Number(c.req.query("limit") ?? "500"), 2000);

  if (!symbol) return badRequest(c, "symbol is required");

  const table = tf === "1d" ? bar1dAdj : bar1mAdj;
  let query = db.select().from(table).where(eq(table.symbol, symbol)).$dynamic();
  if (start) query = query.where(gte(table.time, new Date(start)));
  if (end) query = query.where(lte(table.time, new Date(end)));
  query = query.orderBy(table.time);

  const rows = await query;
  return ok(c, rows);
});

// GET /api/v1/kline/last?symbol=...&tf=1d
klineRoute.get("/last", async (c) => {
  const symbol = c.req.query("symbol");
  const tf = c.req.query("tf") ?? "1d";
  if (!symbol) return badRequest(c, "symbol is required");

  const table = tf === "1d" ? bar1dAdj : bar1mAdj;
  const [row] = await db
    .select()
    .from(table)
    .where(eq(table.symbol, symbol))
    .orderBy(table.time)
    .limit(1);
  return ok(c, row ?? null);
});

export { klineRoute };
