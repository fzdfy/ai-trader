import { Hono } from "hono";
import { db } from "../db";
import { bar1mAdj, bar1dAdj, barPeriodAdj } from "../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const klineRoute = new Hono();

/** 周期线 tf 值 → bar_period_adj.period 列值 */
const PERIOD_TFS = new Set(["5d", "1w", "1mo"]);

klineRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const tf = c.req.query("tf") ?? "1d";
  const start = c.req.query("start");
  const end = c.req.query("end");
  // const limit = Math.min(Number(c.req.query("limit") ?? "500"), 2000);

  if (!symbol) return badRequest(c, "symbol is required");

  // 5d/1w/1mo 走周期线表，1m/1d 走原表
  if (PERIOD_TFS.has(tf)) {
    let query = db
      .select()
      .from(barPeriodAdj)
      .where(and(eq(barPeriodAdj.symbol, symbol), eq(barPeriodAdj.period, tf)))
      .$dynamic();
    if (start) query = query.where(gte(barPeriodAdj.time, new Date(start)));
    if (end) query = query.where(lte(barPeriodAdj.time, new Date(end)));
    query = query.orderBy(barPeriodAdj.time);
    const rows = await query;
    return ok(c, rows);
  }

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

  if (PERIOD_TFS.has(tf)) {
    const [row] = await db
      .select()
      .from(barPeriodAdj)
      .where(and(eq(barPeriodAdj.symbol, symbol), eq(barPeriodAdj.period, tf)))
      .orderBy(barPeriodAdj.time)
      .limit(1);
    return ok(c, row ?? null);
  }

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
