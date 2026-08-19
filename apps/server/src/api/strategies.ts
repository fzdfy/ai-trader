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
  direction?: 1 | -1; // 方向覆盖：-1 反转因子得分
}

// 风控参数（0-100 百分比，与前端 StrategyRiskInput 对齐）
interface StrategyRiskInput {
  entry?: number; // 入场阈值
  exit?: number; // 出场阈值
  positionSize?: number; // 单票仓位
  stopLoss?: number; // 止损线
  takeProfit?: number; // 止盈线
}

// 入场层配置（入场方式 + 过滤开关，对齐 quant composite 引擎 entry 结构）
interface StrategyEntryInput {
  entryType?: string; // threshold=得分达标触发 / cross=得分上穿阈值触发
  volumeConfirm?: boolean; // 量能确认
  limitFilter?: boolean; // 涨跌停过滤
  stFilter?: boolean; // ST 过滤
  marketFilter?: boolean; // 大盘过滤
}

// 信号层合成方式（对齐 quant factors/combine.py 的 COMBINE_MODES）
const COMBINE_MODES = ["weighted_sum", "equal_weight", "voting", "rank", "and", "or"] as const;
type CombineMode = (typeof COMBINE_MODES)[number];

// 将输入 combine 归一化为合法值，非法回退 weighted_sum
function normalizeCombine(v: unknown): CombineMode {
  return (COMBINE_MODES as readonly string[]).includes(v as string)
    ? (v as CombineMode)
    : "weighted_sum";
}

// 将入场方式归一化为 threshold/cross，非法回退 threshold
function normalizeEntryType(v: unknown): "threshold" | "cross" {
  return v === "cross" ? "cross" : "threshold";
}

// 默认风控参数（对齐 quant composite 引擎 / backtest 页默认值）
const RISK_DEFAULTS = { entry: 65, exit: 30, positionSize: 95, stopLoss: 8, takeProfit: 20 };

// 将输入值钳制到 0-100 百分比，非法值回退默认
function clampPct(v: number | undefined, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(100, Math.max(0, n));
}

// 组装对齐 quant composite 引擎的 configJson（factors + combine + entry/exit/risk）
function buildConfigJson(
  factors: { name: string; value: number; weight: number; direction: 1 | -1 }[],
  risk: StrategyRiskInput,
  entry: StrategyEntryInput,
  combine: CombineMode,
): {
  factors: { name: string; value: number; weight: number; direction: 1 | -1 }[];
  combine: CombineMode;
  entry: {
    type: "threshold" | "cross";
    value: number;
    volumeConfirm: boolean;
    limitFilter: boolean;
    stFilter: boolean;
    marketFilter: boolean;
  };
  exit: { type: "threshold"; value: number };
  risk: { positionSize: number; stopLoss: number; takeProfit: number };
} {
  return {
    factors,
    combine,
    entry: {
      type: normalizeEntryType(entry.entryType),
      value: clampPct(risk.entry, RISK_DEFAULTS.entry),
      volumeConfirm: !!entry.volumeConfirm,
      limitFilter: !!entry.limitFilter,
      stFilter: !!entry.stFilter,
      marketFilter: !!entry.marketFilter,
    },
    exit: { type: "threshold", value: clampPct(risk.exit, RISK_DEFAULTS.exit) },
    risk: {
      positionSize: clampPct(risk.positionSize, RISK_DEFAULTS.positionSize),
      stopLoss: clampPct(risk.stopLoss, RISK_DEFAULTS.stopLoss),
      takeProfit: clampPct(risk.takeProfit, RISK_DEFAULTS.takeProfit),
    },
  };
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
    combine?: string;
    isPublic?: boolean;
  } & StrategyRiskInput &
    StrategyEntryInput;
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
      direction: f.direction === -1 ? (-1 as const) : (1 as const),
    }));

  if (factors.length === 0) return badRequest(c, "至少需要选择一个因子");

  const inserted = await db
    .insert(strategyConfig)
    .values({
      userId,
      name,
      description: body.description?.trim() ?? "",
      configJson: buildConfigJson(factors, body, body, normalizeCombine(body.combine)),
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
    combine?: string;
    isPublic?: boolean;
  } & StrategyRiskInput &
    StrategyEntryInput;

  const row = (await db.select().from(strategyConfig).where(eq(strategyConfig.id, id)))[0];
  if (!row) return notFound(c, "Strategy not found");

  // 仅创建者本人可编辑
  if (row.userId !== userId) return c.json({ success: false, error: "Forbidden" }, 403);

  // 规范化因子列表（过滤无名字或权重为 0 的项）
  let factors: { name: string; value: number; weight: number; direction: 1 | -1 }[] | undefined;
  if (Array.isArray(body.factors)) {
    factors = body.factors
      .filter((f) => f?.name && f.weight > 0)
      .map((f) => ({
        name: f.name,
        value: Number(f.value) || 0,
        weight: Number(f.weight) || 0,
        direction: f.direction === -1 ? (-1 as const) : (1 as const),
      }));
  }

  // 合并风控参数：未提供的字段沿用已有 configJson（历史数据缺失时由 buildConfigJson 兜底默认值）
  const prev = (row.configJson ?? {}) as {
    factors?: { name: string; value: number; weight: number; direction?: 1 | -1 }[];
    combine?: string;
    entry?: {
      type?: "threshold" | "cross";
      value?: number;
      volumeConfirm?: boolean;
      limitFilter?: boolean;
      stFilter?: boolean;
      marketFilter?: boolean;
    };
    exit?: { value: number };
    risk?: { positionSize?: number; stopLoss?: number; takeProfit?: number };
  };
  const nextFactors = (factors && factors.length > 0 ? factors : (prev.factors ?? [])).map(
    (f) => ({ ...f, direction: f.direction === -1 ? (-1 as const) : (1 as const) }),
  );
  const nextCombine = normalizeCombine(body.combine ?? prev.combine);
  const nextEntry: StrategyEntryInput = {
    entryType: body.entryType ?? prev.entry?.type,
    volumeConfirm: body.volumeConfirm ?? prev.entry?.volumeConfirm,
    limitFilter: body.limitFilter ?? prev.entry?.limitFilter,
    stFilter: body.stFilter ?? prev.entry?.stFilter,
    marketFilter: body.marketFilter ?? prev.entry?.marketFilter,
  };
  const hasRiskUpdate =
    body.entry !== undefined ||
    body.exit !== undefined ||
    body.positionSize !== undefined ||
    body.stopLoss !== undefined ||
    body.takeProfit !== undefined;
  const hasEntryUpdate =
    body.entryType !== undefined ||
    body.volumeConfirm !== undefined ||
    body.limitFilter !== undefined ||
    body.stFilter !== undefined ||
    body.marketFilter !== undefined;
  const hasConfigUpdate =
    Array.isArray(body.factors) || body.combine !== undefined || hasRiskUpdate || hasEntryUpdate;
  const configJson = buildConfigJson(
    nextFactors,
    {
      entry: body.entry ?? prev.entry?.value,
      exit: body.exit ?? prev.exit?.value,
      positionSize: body.positionSize ?? prev.risk?.positionSize,
      stopLoss: body.stopLoss ?? prev.risk?.stopLoss,
      takeProfit: body.takeProfit ?? prev.risk?.takeProfit,
    },
    nextEntry,
    nextCombine,
  );

  const updated = (
    await db
      .update(strategyConfig)
      .set({
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() || null } : {}),
        ...(typeof body.isPublic === "boolean" ? { isPublic: body.isPublic } : {}),
        ...(hasConfigUpdate ? { configJson } : {}),
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
