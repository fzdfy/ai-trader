import { Hono } from "hono";
import { db } from "../db";
import { factorRegistry } from "../db/schema";
import { eq } from "drizzle-orm";
import { ok, created, badRequest, notFound } from "../lib/response";
import { ensureFactorsSeeded } from "../db/seed";

const factorsRoute = new Hono();

// GET /api/v1/factors — 因子列表（首次访问时幂等初始化内置因子）
factorsRoute.get("/", async (c) => {
  await ensureFactorsSeeded();
  const rows = await db.select().from(factorRegistry);
  return ok(c, rows);
});

// GET /api/v1/factors/:name — 因子详情
factorsRoute.get("/:name", async (c) => {
  const name = c.req.param("name");
  const rows = await db.select().from(factorRegistry).where(eq(factorRegistry.name, name));
  const row = rows[0];
  if (!row) return notFound(c, "Factor not found");
  return ok(c, row);
});

// POST /api/v1/factors — 创建因子（name + description）
factorsRoute.post("/", async (c) => {
  const body = (await c.req.json()) as { name?: string; description?: string };
  const name = body.name?.trim();
  if (!name) return badRequest(c, "name is required");

  // 用户自定义因子：label 复用 name，分类固定为 custom，方向默认正向
  const inserted = await db
    .insert(factorRegistry)
    .values({
      name,
      label: name,
      category: "custom",
      direction: 1,
      description: body.description?.trim() ?? "",
    })
    .onConflictDoNothing()
    .returning();

  // 重名时返回已存在的因子，避免主键冲突报错
  if (inserted.length === 0) {
    const existing = await db.select().from(factorRegistry).where(eq(factorRegistry.name, name));
    return ok(c, existing[0]);
  }

  return created(c, inserted[0]);
});

export { factorsRoute };
