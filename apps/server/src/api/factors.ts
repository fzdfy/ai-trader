import { Hono } from "hono";
import { db } from "../db";
import { factorRegistry } from "../db/schema";
import { eq, or } from "drizzle-orm";
import { ok, created, badRequest, notFound, serverError } from "../lib/response";
import { resolveCreatorNames } from "../lib/creators";
import { ensureFactorsSeeded } from "../db/seed";
import { mastra } from "../agent/mastra";

const factorsRoute = new Hono();

// GET /api/v1/factors — 因子列表（公开的 + 当前用户创建的）
factorsRoute.get("/", async (c) => {
  await ensureFactorsSeeded();
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
      expression: body.expression?.trim() ?? null,
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
    return ok(c, { expression });
  } catch (err) {
    console.error("[factors] generate expression error:", err);
    return serverError(c, "AI 生成服务暂时不可用，请稍后重试。");
  }
});

export { factorsRoute };
