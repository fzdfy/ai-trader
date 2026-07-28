import { Hono } from "hono";
import { db } from "../db";
import { quoteLatest } from "../db/schema";
import { inArray } from "drizzle-orm";
import { ok } from "../lib/response";

const quotesRoute = new Hono();

// GET /api/v1/quotes/latest?codes=000001.SZ,600000.SH
quotesRoute.get("/latest", async (c) => {
  const codesStr = c.req.query("codes") ?? "";
  if (!codesStr) return ok(c, []);
  const codes = codesStr.split(",").map((s) => s.trim()).filter(Boolean);
  const rows = await db.select().from(quoteLatest).where(inArray(quoteLatest.symbol, codes));
  return ok(c, rows);
});

export { quotesRoute };
