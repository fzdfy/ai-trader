import { Hono, type Context } from "hono";
import { and, asc, count, eq, like, or } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../db";
import { instrument, watchlist } from "../db/schema";
import { created, ok, paginated } from "../lib/response";
import { parseWatchlistQuery } from "../lib/stock-list-query";

type WatchlistUserResolver = (headers: Headers) => Promise<string | null>;

export async function resolveWatchlistUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}

function unauthorized(c: Context) {
  return c.json({ success: false, error: "Unauthorized" }, 401);
}

export function createWatchlistRoute(
  resolveUserId: WatchlistUserResolver = resolveWatchlistUserId,
) {
  const route = new Hono();

  route.get("/", async (c) => {
    const userId = await resolveUserId(c.req.raw.headers);
    if (!userId) return unauthorized(c);

    const rows = await db
      .select({ symbol: watchlist.symbol })
      .from(watchlist)
      .where(eq(watchlist.userId, userId))
      .orderBy(asc(watchlist.symbol));
    return ok(c, rows.map((row) => row.symbol));
  });

  route.get("/instruments", async (c) => {
    const userId = await resolveUserId(c.req.raw.headers);
    if (!userId) return unauthorized(c);
    const parsed = parseWatchlistQuery(new URL(c.req.url).searchParams);
    if (!parsed.ok) return c.json({ success: false, error: parsed.message }, 400);

    const whereClause = and(
      eq(watchlist.userId, userId),
      parsed.q
        ? or(
            like(instrument.code, `%${parsed.q}%`),
            like(instrument.symbol, `%${parsed.q}%`),
            like(instrument.name, `%${parsed.q}%`),
          )
        : undefined,
    );
    const base = db
      .select({ instrument })
      .from(watchlist)
      .innerJoin(instrument, eq(watchlist.symbol, instrument.symbol))
      .where(whereClause);

    if (parsed.mode === "legacy") {
      const rows = await base.orderBy(asc(instrument.symbol));
      return ok(c, rows.map((row) => row.instrument));
    }

    const [rows, [countResult]] = await Promise.all([
      base
        .orderBy(asc(instrument.symbol))
        .limit(parsed.limit)
        .offset((parsed.page - 1) * parsed.limit),
      db
        .select({ count: count() })
        .from(watchlist)
        .innerJoin(instrument, eq(watchlist.symbol, instrument.symbol))
        .where(whereClause),
    ]);
    return paginated(
      c,
      rows.map((row) => row.instrument),
      countResult?.count ?? 0,
      parsed.page,
      parsed.limit,
    );
  });

  route.post("/", async (c) => {
    const userId = await resolveUserId(c.req.raw.headers);
    if (!userId) return unauthorized(c);
    const { symbol } = await c.req.json<{ symbol?: unknown }>();
    if (typeof symbol !== "string" || !symbol.trim()) {
      return c.json({ success: false, error: "symbol required" }, 400);
    }

    await db
      .insert(watchlist)
      .values({ userId, symbol: symbol.trim() })
      .onConflictDoNothing();
    return created(c, { symbol: symbol.trim() });
  });

  route.delete("/:symbol", async (c) => {
    const userId = await resolveUserId(c.req.raw.headers);
    if (!userId) return unauthorized(c);
    const symbol = c.req.param("symbol");
    await db
      .delete(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.symbol, symbol)));
    return ok(c, { removed: symbol });
  });

  return route;
}

export const watchlistRoute = createWatchlistRoute();
