import { Hono } from "hono";
import { db } from "../db";
import { signal } from "../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const signalsRoute = new Hono();

signalsRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const modelId = c.req.query("model");
  const start = c.req.query("start");
  const end = c.req.query("end");
  const limit = Math.min(Number(c.req.query("limit") ?? "200"), 1000);

  if (!symbol) return badRequest(c, "symbol is required");

  let query = db.select().from(signal).where(eq(signal.symbol, symbol)).$dynamic();
  if (modelId) query = query.where(eq(signal.modelId, BigInt(modelId)));
  if (start) query = query.where(gte(signal.time, new Date(start)));
  if (end) query = query.where(lte(signal.time, new Date(end)));
  query = query.orderBy(signal.time).limit(limit);

  return ok(c, await query);
});

export { signalsRoute };
