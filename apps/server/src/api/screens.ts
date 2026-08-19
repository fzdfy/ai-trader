import { Hono } from "hono";
import { db } from "../db";
import { strategyConfig } from "../db/schema";
import { eq } from "drizzle-orm";
import { ok, badRequest, notFound } from "../lib/response";

const QUANT_URL = process.env.QUANT_URL ?? "http://localhost:3002";

const screensRoute = new Hono();

// POST /api/v1/screens/run — 根据策略选股（读取策略因子 → 代理 quant 打分排名）
screensRoute.post("/run", async (c) => {
  const body = (await c.req.json()) as { strategyId?: number; topN?: number };
  const strategyId = Number(body.strategyId);
  const topN = Number(body.topN) || 20;

  if (!Number.isInteger(strategyId)) return badRequest(c, "strategyId is required");

  const rows = await db
    .select()
    .from(strategyConfig)
    .where(eq(strategyConfig.id, strategyId));
  const strategy = rows[0];
  if (!strategy) return notFound(c, "Strategy not found");

  // 策略 = 因子集合，取出 { name, value, weight, direction } 交给 quant 打分（weight/value 0-100）
  const cfg = strategy.configJson as {
    factors?: { name: string; value?: number; weight: number; direction?: number }[];
    combine?: string;
  };
  const factors = (cfg.factors ?? []).map((f) => ({
    name: f.name,
    value: f.value ?? 50,
    weight: f.weight,
    direction: f.direction === -1 ? -1 : 1,
  }));
  const combine = cfg.combine ?? "weighted_sum";

  const res = await fetch(`${QUANT_URL}/api/v1/screens/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ factors, topN, combine }),
  });
  const json = (await res.json()) as {
    items?: unknown[];
    total?: number;
    detail?: string;
  };

  if (!res.ok) {
    return c.json(
      { success: false, error: json.detail ?? "Screen failed" },
      res.status as 400 | 404 | 500,
    );
  }

  return ok(c, {
    items: json.items ?? [],
    total: json.total ?? 0,
    strategy: { id: strategy.id, name: strategy.name },
  });
});

export { screensRoute };
