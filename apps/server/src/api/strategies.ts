import { Hono } from "hono";
import { db } from "../db";
import { strategyConfig } from "../db/schema";
import { eq, or, desc } from "drizzle-orm";
import { ok, created, badRequest, notFound } from "../lib/response";
import { resolveCreatorNames } from "../lib/creators";
import { ensureStrategiesSeeded } from "../db/seed";

const strategiesRoute = new Hono();

// 策略内单个因子的配置结构（写入 configJson）
interface StrategyFactorInput {
  name: string;
  value: number; // 信号阈值 / 参数值 0-100
  weight: number; // 权重 0-100
}

// GET /api/v1/strategies — 公开策略 + 当前用户策略
strategiesRoute.get("/", async (c) => {
  await ensureStrategiesSeeded();
  const userId = c.req.header("X-User-Id");

  // 用户只能看到「公开的」和「自己创建的」策略
  const conditions = [eq(strategyConfig.isPublic, true)];
  if (userId) conditions.push(eq(strategyConfig.userId, userId));

  const rows = await db
    .select()
    .from(strategyConfig)
    .where(or(...conditions))
    .orderBy(desc(strategyConfig.createdAt));
  const creators = await resolveCreatorNames(rows.map((r) => r.userId));
  return ok(
    c,
    rows.map((r) => ({ ...r, creator: creators[r.userId] ?? r.userId })),
  );
});

// GET /api/v1/strategies/:id — 策略详情（仅公开的或自己的可见）
strategiesRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return badRequest(c, "invalid id");

  const userId = c.req.header("X-User-Id");
  const rows = await db.select().from(strategyConfig).where(eq(strategyConfig.id, id));
  const row = rows[0];
  if (!row) return notFound(c, "Strategy not found");

  // 私有且非本人创建的策略，对他人隐藏
  if (!row.isPublic && row.userId !== userId) return notFound(c, "Strategy not found");

  const creators = await resolveCreatorNames([row.userId]);
  return ok(c, { ...row, creator: creators[row.userId] ?? row.userId });
});

// POST /api/v1/strategies — 创建用户策略
strategiesRoute.post("/", async (c) => {
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    factors?: StrategyFactorInput[];
    isPublic?: boolean;
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
      isPublic: body.isPublic ?? false, // 用户策略默认私有
    })
    .returning();

  return created(c, inserted[0]);
});

// PATCH /api/v1/strategies/:id — 编辑策略（仅创建者本人可改）
strategiesRoute.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return badRequest(c, "invalid id");

  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    factors?: StrategyFactorInput[];
    isPublic?: boolean;
  };

  const row = (await db.select().from(strategyConfig).where(eq(strategyConfig.id, id)))[0];
  if (!row) return notFound(c, "Strategy not found");

  // 仅创建者本人可编辑
  if (row.userId !== userId) return c.json({ success: false, error: "Forbidden" }, 403);

  // 规范化因子列表（过滤无名字或权重为 0 的项）
  let factors: { name: string; value: number; weight: number }[] | undefined;
  if (Array.isArray(body.factors)) {
    factors = body.factors
      .filter((f) => f?.name && f.weight > 0)
      .map((f) => ({ name: f.name, value: Number(f.value) || 0, weight: Number(f.weight) || 0 }));
  }

  const updated = (
    await db
      .update(strategyConfig)
      .set({
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(typeof body.isPublic === "boolean" ? { isPublic: body.isPublic } : {}),
        ...(factors && factors.length > 0 ? { configJson: { factors } } : {}),
        updatedAt: new Date(),
      })
      .where(eq(strategyConfig.id, id))
      .returning()
  )[0];
  if (!updated) return notFound(c, "Strategy not found");

  const creators = await resolveCreatorNames([updated.userId]);
  return ok(c, { ...updated, creator: creators[updated.userId] ?? updated.userId });
});

// DELETE /api/v1/strategies/:id — 删除策略（仅创建者本人可删，系统策略不可删）
strategiesRoute.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return badRequest(c, "invalid id");

  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const row = (await db.select().from(strategyConfig).where(eq(strategyConfig.id, id)))[0];
  if (!row) return notFound(c, "Strategy not found");

  // 仅创建者本人可删除；系统策略不允许删除
  if (row.userId !== userId) return c.json({ success: false, error: "Forbidden" }, 403);
  if (row.isSystem) return c.json({ success: false, error: "系统策略不可删除" }, 403);

  await db.delete(strategyConfig).where(eq(strategyConfig.id, id));
  return ok(c, { id });
});

export { strategiesRoute };
