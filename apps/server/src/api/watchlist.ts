import { Hono } from "hono";
import { db } from "../db";
import { watchlist, instrument } from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { ok, created } from "../lib/response";

const watchlistRoute = new Hono();

// GET /api/v1/watchlist — 获取用户自选列表
watchlistRoute.get("/", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const rows = await db
    .select()
    .from(watchlist)
    .where(eq(watchlist.userId, userId));

  return ok(c, rows.map((r) => r.symbol));
});

// GET /api/v1/watchlist/instruments — 获取自选标的详情
watchlistRoute.get("/instruments", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const wlRows = await db
    .select({ symbol: watchlist.symbol })
    .from(watchlist)
    .where(eq(watchlist.userId, userId));

  const symbols = wlRows.map((r) => r.symbol);
  if (symbols.length === 0) return ok(c, []);

  const rows = await db
    .select()
    .from(instrument)
    .where(inArray(instrument.symbol, symbols));

  return ok(c, rows);
});

// POST /api/v1/watchlist — 添加自选
watchlistRoute.post("/", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const { symbol } = await c.req.json();
  if (!symbol) return c.json({ success: false, error: "symbol required" }, 400);

  await db
    .insert(watchlist)
    .values({ userId, symbol })
    .onConflictDoNothing();

  return created(c, { symbol });
});

// DELETE /api/v1/watchlist/:symbol — 移除自选
watchlistRoute.delete("/:symbol", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const symbol = c.req.param("symbol");
  await db
    .delete(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.symbol, symbol)));

  return ok(c, { removed: symbol });
});

export { watchlistRoute };
