import { Hono } from "hono";
import { db } from "../db";
import { strategyConfig } from "../db/schema";
import { eq, or, desc } from "drizzle-orm";
import { ok, created, badRequest, notFound } from "../lib/response";
import { ensureStrategiesSeeded } from "../db/seed";

const strategiesRoute = new Hono();

// 策略内单个因子的配置结构（写入 configJson）
interface StrategyFactorInput {
  name: string;
  value: number; // 信号阈值 / 参数值 0-100
  weight: number; // 权重 0-100
}

// GET /api/v1/strategies — 系统策略 + 当前用户策略
strategiesRoute.get("/", async (c) => {
  await ensureStrategiesSeeded();
  const userId = c.req.header("X-User-Id");

  const conditions = [eq(strategyConfig.isSystem, true)];
  if (userId) conditions.push(eq(strategyConfig.userId, userId));

  const rows = await db
    .select()
    .from(strategyConfig)
    .where(or(...conditions))
    .orderBy(desc(strategyConfig.createdAt));
  return ok(c, rows);
});

// GET /api/v1/strategies/:id — 策略详情
strategiesRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return badRequest(c, "invalid id");

  const rows = await db.select().from(strategyConfig).where(eq(strategyConfig.id, id));
  const row = rows[0];
  if (!row) return notFound(c, "Strategy not found");
  return ok(c, row);
});

// POST /api/v1/strategies — 创建用户策略
strategiesRoute.post("/", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    factors?: StrategyFactorInput[];
  };
  const name = body.name?.trim();
  if (!name) return badRequest(c, "name is required");
  if (!Array.isArray(body.factors) || body.factors.length === 0) {
    return badRequest(c, "factors is required");
  }

  const factors = body.factors
    .filter((f) => f?.name && f.weight > 0)
    .map((f) => ({
      name: f.name,
      value: Number(f.value) || 0,
      weight: Number(f.weight) || 0,
    }));

  if (factors.length === 0) return badRequest(c, "至少需要选择一个因子");

  const inserted = await db
    .insert(strategyConfig)
    .values({
      userId,
      name,
      description: body.description?.trim() ?? "",
      configJson: { factors },
      isSystem: false,
    })
    .returning();

  return created(c, inserted[0]);
});

export { strategiesRoute };
