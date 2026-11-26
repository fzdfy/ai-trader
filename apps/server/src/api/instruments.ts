import { Hono } from "hono";
import { db } from "../db";
import { instrument } from "../db/schema";
import { eq, like, or, and, count } from "drizzle-orm";
import { ok, badRequest, paginated, notFound } from "../lib/response";
import {
  parseInstrumentListQuery,
  stockSymbolAscending,
} from "../lib/stock-list-query";

const instrumentsRoute = new Hono();

// GET /api/v1/instruments — search/list instruments
instrumentsRoute.get("/", async (c) => {
  const parsed = parseInstrumentListQuery(new URL(c.req.url).searchParams);
  if (!parsed.ok) return badRequest(c, parsed.message);
  const { page, limit, q } = parsed;
  const exchange = c.req.query("exchange");
  const status = c.req.query("status");
  const offset = (page - 1) * limit;

  const conditions = [];

  if (q) {
    conditions.push(
      or(
        like(instrument.code, `%${q}%`),
        like(instrument.symbol, `%${q}%`),
        like(instrument.name, `%${q}%`),
      ),
    );
  }
  if (exchange) {
    conditions.push(eq(instrument.exchange, exchange));
  }
  if (status) {
    conditions.push(eq(instrument.status, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const dataQuery = db.select().from(instrument).$dynamic();
  const countQuery = db.select({ count: count() }).from(instrument).$dynamic();

  if (whereClause) {
    dataQuery.where(whereClause);
    countQuery.where(whereClause);
  }
  dataQuery
    .orderBy(stockSymbolAscending(instrument.symbol))
    .limit(limit)
    .offset(offset);

  const [rows, [countResult]] = await Promise.all([dataQuery, countQuery]);
  const total = countResult?.count ?? 0;

  return paginated(c, rows, total, page, limit);
});

// GET /api/v1/instruments/:symbol
instrumentsRoute.get("/:symbol", async (c) => {
  const symbol = c.req.param("symbol");
  const [row] = await db
    .select()
    .from(instrument)
    .where(eq(instrument.symbol, symbol))
    .limit(1);
  if (!row) return notFound(c, `Instrument ${symbol} not found`);
  return ok(c, row);
});

export { instrumentsRoute };
