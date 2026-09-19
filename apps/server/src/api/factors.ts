import { Hono } from "hono";
import { db } from "../db";
import { factorRegistry } from "../db/schema";
import { eq, or } from "drizzle-orm";
import { ok, created, badRequest, notFound, serverError } from "../lib/response";
import { resolveCreatorNames } from "../lib/creators";
import { mastra } from "../agent/mastra";
import {
  FACTOR_GENERATION_FAILURE,
  validateFactorExpression,
} from "../agent/mastra/agents/factor-generator";

const factorsRoute = new Hono();

// GET /api/v1/factors — 因子列表（公开的 + 当前用户创建的）
factorsRoute.get("/", async (c) => {
  const userId = c.req.header("X-User-Id");

  // 用户只能看到「公开的」和「自己创建的」因子
  const conditions = [eq(factorRegistry.isPublic, true)];
  if (userId) conditions.push(eq(factorRegistry.createdBy, userId));

  const rows = await db
    .select()
    .from(factorRegistry)
    .where(or(...conditions))
    .orderBy(factorRegistry.createdAt);
  const creators = await resolveCreatorNames(rows.map((r) => r.createdBy));
  return ok(
    c,
    rows.map((r) => ({ ...r, creator: creators[r.createdBy] ?? r.createdBy })),
  );
});

// GET /api/v1/factors/:name — 因子详情（仅公开的或自己的可见）
factorsRoute.get("/:name", async (c) => {
  const name = c.req.param("name");
  const userId = c.req.header("X-User-Id");
  const rows = await db.select().from(factorRegistry).where(eq(factorRegistry.name, name));
  const row = rows[0];
  if (!row) return notFound(c, "Factor not found");

  // 私有且非本人创建的因子，对他人隐藏
  if (!row.isPublic && row.createdBy !== userId) return notFound(c, "Factor not found");

  const creators = await resolveCreatorNames([row.createdBy]);
  return ok(c, { ...row, creator: creators[row.createdBy] ?? row.createdBy });
});

// POST /api/v1/factors — 创建因子（name + description + expression + isPublic）
factorsRoute.post("/", async (c) => {
  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    expression?: string;
    isPublic?: boolean;
  };
  const name = body.name?.trim();
  if (!name) return badRequest(c, "name is required");

  // 表达式若提供，必须能被 AKQuant 引擎解析（与 /generate 同一套白名单）
  const expression = body.expression?.trim() || null;
  if (expression) {
    const validation = validateFactorExpression(expression);
    if (!validation.ok) return badRequest(c, `因子表达式不合法：${validation.reason}`);
  }

  // 记录创建者：优先取请求头中的用户 ID，缺省为 system
  const createdBy = c.req.header("X-User-Id") ?? "system";

  // 用户自定义因子：label 复用 name，分类固定为 custom，方向默认正向
  const inserted = await db
    .insert(factorRegistry)
    .values({
      name,
      label: name,
      category: "custom",
      direction: 1,
      description: body.description?.trim() ?? "",
      expression,
      createdBy,
      isPublic: body.isPublic ?? false, // 用户自定义因子默认私有
    })
    .onConflictDoNothing()
    .returning();

  // 重名时返回已存在的因子，避免主键冲突报错
  const row =
    inserted[0] ??
    (await db.select().from(factorRegistry).where(eq(factorRegistry.name, name)))[0];

  if (!row) return notFound(c, "Factor not found");

  const creators = await resolveCreatorNames([row.createdBy]);
  const result = { ...row, creator: creators[row.createdBy] ?? row.createdBy };
  return inserted[0] ? created(c, result) : ok(c, result);
});

// PATCH /api/v1/factors/:name — 编辑因子（仅创建者本人可改）
factorsRoute.patch("/:name", async (c) => {
  const name = c.req.param("name");
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = (await c.req.json()) as {
    label?: string;
    expression?: string;
    description?: string;
    isPublic?: boolean;
  };

  const row = (await db.select().from(factorRegistry).where(eq(factorRegistry.name, name)))[0];
  if (!row) return notFound(c, "Factor not found");

  // 仅创建者本人可编辑
  if (row.createdBy !== userId) return c.json({ success: false, error: "Forbidden" }, 403);

  // 表达式若提供且非空，必须能被 AKQuant 引擎解析（与 POST 同一套白名单）
  const nextExpression = body.expression?.trim() || null;
  if (nextExpression) {
    const validation = validateFactorExpression(nextExpression);
    if (!validation.ok) return badRequest(c, `因子表达式不合法：${validation.reason}`);
  }

  const updated = (
    await db
      .update(factorRegistry)
      .set({
        ...(body.label?.trim() ? { label: body.label.trim() } : {}),
        ...(body.expression !== undefined ? { expression: body.expression.trim() || null } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(typeof body.isPublic === "boolean" ? { isPublic: body.isPublic } : {}),
      })
      .where(eq(factorRegistry.name, name))
      .returning()
  )[0];
  if (!updated) return notFound(c, "Factor not found");

  const creators = await resolveCreatorNames([updated.createdBy]);
  return ok(c, { ...updated, creator: creators[updated.createdBy] ?? updated.createdBy });
});

// DELETE /api/v1/factors/:name — 删除因子（仅创建者本人可删，系统因子不可删）
factorsRoute.delete("/:name", async (c) => {
  const name = c.req.param("name");
  const userId = c.req.header("X-User-Id");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  const row = (await db.select().from(factorRegistry).where(eq(factorRegistry.name, name)))[0];
  if (!row) return notFound(c, "Factor not found");

  // 仅创建者本人可删除；系统内置因子不允许删除
  if (row.createdBy !== userId) return c.json({ success: false, error: "Forbidden" }, 403);

  await db.delete(factorRegistry).where(eq(factorRegistry.name, name));
  return ok(c, { name });
});

// POST /api/v1/factors/generate — AI 根据描述生成因子表达式
factorsRoute.post("/generate", async (c) => {
  const body = (await c.req.json()) as { description?: string };
  const description = body.description?.trim();
  if (!description) return badRequest(c, "description is required");

  try {
    const agent = mastra.getAgent("factorGenerator");
    const response = await agent.generate(description);
    const expression = response.text.trim();

    // 模型明确判定「无法表达」时，直接透传哨兵文案（前端据此给出提示）
    if (expression === FACTOR_GENERATION_FAILURE) {
      return ok(c, { expression: FACTOR_GENERATION_FAILURE });
    }

    // 强制校验：表达式只能由白名单内的「行情列 / 算子 / 运算符与语法」构成
    const validation = validateFactorExpression(expression);
    if (!validation.ok) {
      console.warn(
        "[factors] 因子表达式未通过校验：",
        validation.reason,
        "| 原始输出：",
        expression,
      );
      return ok(c, { expression: FACTOR_GENERATION_FAILURE });
    }

    return ok(c, { expression });
  } catch (err) {
    console.error("[factors] generate expression error:", err);
    return serverError(c, "AI 生成服务暂时不可用，请稍后重试。");
  }
});

export { factorsRoute };
