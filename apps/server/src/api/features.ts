import { Hono } from "hono";
import { db } from "../db";
import { featureValue, featureSet } from "../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";

const featuresRoute = new Hono();

featuresRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const featureSetId = c.req.query("feature_set");
  const start = c.req.query("start");
  const end = c.req.query("end");
  const limit = Math.min(Number(c.req.query("limit") ?? "200"), 1000);

  if (!symbol) return badRequest(c, "symbol is required");

  let query = db.select().from(featureValue).where(eq(featureValue.symbol, symbol)).$dynamic();
  if (featureSetId) query = query.where(eq(featureValue.featureSetId, Number(featureSetId)));
  if (start) query = query.where(gte(featureValue.time, new Date(start)));
  if (end) query = query.where(lte(featureValue.time, new Date(end)));
  query = query.orderBy(featureValue.time).limit(limit);

  return ok(c, await query);
});

featuresRoute.get("/sets", async (c) => {
  return ok(c, await db.select().from(featureSet));
});

export { featuresRoute };
