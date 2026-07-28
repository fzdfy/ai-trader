import { Hono } from "hono";
import { db } from "../db";
import { bar1dAdj } from "../db/schema";
import { eq, lte, gte } from "drizzle-orm";
import { runBacktest, type StrategyConfig } from "../engine";
import type { Bar } from "../engine";
import { ok, badRequest } from "../lib/response";

const backtestsRoute = new Hono();

// POST /api/v1/backtests/run
backtestsRoute.post("/run", async (c) => {
  const body = await c.req.json();
  const { symbol, startDate, endDate, strategy } = body as {
    symbol?: string;
    startDate?: string;
    endDate?: string;
    strategy?: StrategyConfig;
  };

  if (!symbol) return badRequest(c, "symbol is required");
  if (!strategy) return badRequest(c, "strategy is required");

  const conditions = [eq(bar1dAdj.symbol, symbol)];
  if (startDate) conditions.push(gte(bar1dAdj.time, new Date(startDate)));
  if (endDate) conditions.push(lte(bar1dAdj.time, new Date(endDate)));

  const rows = await db
    .select()
    .from(bar1dAdj)
    .where(eq(bar1dAdj.symbol, symbol))
    .orderBy(bar1dAdj.time);

  const bars: Bar[] = rows.map((r) => ({
    time: r.time.toISOString().split("T")[0] ?? "",
    open: Number.parseFloat(r.open),
    high: Number.parseFloat(r.high),
    low: Number.parseFloat(r.low),
    close: Number.parseFloat(r.close),
    volume: Number.parseFloat(r.volume),
  }));

  const result = runBacktest(bars, strategy);

  return ok(c, result);
});

export { backtestsRoute };
