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
import { validateFactorCode } from "../lib/factor-code";

const factorsRoute = new Hono();

/** 归一化因子定义方式：仅允许 expression（AKQuant 表达式）与 python（Python 代码） */
function normalizeKind(value: unknown): "expression" | "python" {
  return value === "python" ? "python" : "expression";
}

/** 按定义方式校验并给出要落库的 expression / code */
function resolveDefinition(
  kind: "expression" | "python",
  raw: { expression?: string; code?: string },
):
  | { ok: true; expression: string | null; code: string | null }
  | { ok: false; reason: string } {
  if (kind === "python") {
    const code = raw.code?.trim() || null;
    if (!code) return { ok: false, reason: "Python 因子必须提供代码" };
    const validation = validateFactorCode(code);
    if (!validation.ok) return { ok: false, reason: `Python 代码不合法：${validation.reason}` };
    return { ok: true, expression: null, code };
  }

  const expression = raw.expression?.trim() || null;
  if (expression) {
    const validation = validateFactorExpression(expression);
    if (!validation.ok) return { ok: false, reason: `因子表达式不合法：${validation.reason}` };
  }
  return { ok: true, expression, code: null };
}

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

// POST /api/v1/factors — 创建因子（name + kind + expression/code + description + isPublic）
factorsRoute.post("/", async (c) => {
  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    kind?: string;
    expression?: string;
    code?: string;
    isPublic?: boolean;
  };
  const name = body.name?.trim();
  if (!name) return badRequest(c, "name is required");

  // 按定义方式校验：expression 走 AKQuant 白名单，python 走代码校验
  const kind = normalizeKind(body.kind);
  const definition = resolveDefinition(kind, body);
  if (!definition.ok) return badRequest(c, definition.reason);

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
      kind,
      expression: definition.expression,
      code: definition.code,
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
    kind?: string;
    expression?: string;
    code?: string;
    description?: string;
    isPublic?: boolean;
  };

  const row = (await db.select().from(factorRegistry).where(eq(factorRegistry.name, name)))[0];
  if (!row) return notFound(c, "Factor not found");

  // 仅创建者本人可编辑
  if (row.createdBy !== userId) return c.json({ success: false, error: "Forbidden" }, 403);

  // 定义方式可切换；未显式传 kind 时沿用原值，并按最终方式重新校验
  const nextKind = body.kind === undefined ? normalizeKind(row.kind) : normalizeKind(body.kind);
  const definitionChanged =
    body.kind !== undefined || body.expression !== undefined || body.code !== undefined;

  const nextDefinition = definitionChanged
    ? resolveDefinition(nextKind, {
        expression: body.expression ?? row.expression ?? undefined,
        code: body.code ?? row.code ?? undefined,
      })
    : null;
  if (nextDefinition && !nextDefinition.ok) return badRequest(c, nextDefinition.reason);

  const updated = (
    await db
      .update(factorRegistry)
      .set({
        ...(body.label?.trim() ? { label: body.label.trim() } : {}),
        ...(definitionChanged
          ? {
              kind: nextKind,
              expression: nextDefinition!.expression,
              code: nextDefinition!.code,
            }
          : {}),
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
