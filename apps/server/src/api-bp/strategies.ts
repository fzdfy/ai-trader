import { Hono } from "hono";
import { db } from "../db";
import { strategyConfig } from "../db/schema";
import { eq, or, desc } from "drizzle-orm";
import { ok, created, badRequest, notFound } from "../lib/response";
import { resolveCreatorNames } from "../lib/creators";
import { ensureStrategiesSeeded, ensureAtrusStrategiesSeeded } from "../db/seed";

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
  stopLoss?: number; // 固定止损线
  takeProfit?: number; // 固定止盈线
  stopType?: string; // fixed=固定百分比 / trailing=移动止损 / atr=ATR 止损
  trailingStop?: number; // 移动止损回撤比例 0-100
  atrStopMultiple?: number; // ATR 止损倍数
  takeType?: string; // fixed=固定百分比 / trailing=移动止盈
  trailingTake?: number; // 移动止盈回撤比例 0-100
  maxLossPerTrade?: number; // 单笔最大亏损 0-100（0=不限）
  maxConsecutiveLosses?: number; // 连续亏损熔断次数（0=不限）
}

// 入场层配置（入场方式 + 过滤开关，对齐 quant composite 引擎 entry 结构）
interface StrategyEntryInput {
  entryType?: string; // threshold=得分达标触发 / cross=得分上穿阈值触发
  volumeConfirm?: boolean; // 量能确认
  limitFilter?: boolean; // 涨跌停过滤
  stFilter?: boolean; // ST 过滤
  marketFilter?: boolean; // 大盘过滤
}

// 出场层配置（出场方式 + 持仓时间上限，对齐 quant composite 引擎 exit 结构）
interface StrategyExitInput {
  exitType?: string; // threshold=得分≤阈值触发 / cross=得分下穿阈值触发
  maxHoldingDays?: number; // 持仓时间上限（交易日，0=不限）
}

// 仓位层配置（计算方式 + 上限 + 分批建仓/止盈，对齐 quant composite 引擎 position 结构）
interface StrategyPositionInput {
  sizing?: string; // fixed=固定比例 / kelly=凯利公式 / atr=ATR 波动率
  baseSize?: number; // 基础目标仓位 0-100
  maxSize?: number; // 单票仓位硬上限 0-100
  totalCap?: number; // 总仓位上限 0-100
  maxPositions?: number; // 最大持仓数量
  kellyFraction?: number; // 凯利分数系数 0-100
  atrPeriod?: number; // ATR 周期
  atrRiskBudget?: number; // ATR 单笔风险预算 0-100
  pyramiding?: boolean; // 分批建仓
  firstEntry?: number; // 首仓比例 0-100
  addOnProfit?: number; // 加仓触发浮盈阈值 0-100
  addSize?: number; // 每次加仓比例 0-100
  maxAdds?: number; // 最大加仓次数
  partialExit?: boolean; // 分批止盈
  partialExitRatio?: number; // 首段止盈后保留比例 0-100
}

// 成本层配置（费率为万分比，最低佣金/固定滑点为元，对齐 quant 引擎 cost 结构）
interface StrategyCostInput {
  commissionRate?: number; // 佣金费率（万分比）
  stampTaxRate?: number; // 印花税（万分比）
  transferFeeRate?: number; // 过户费（万分比）
  minCommission?: number; // 最低佣金（元）
  slippageType?: string; // percent=按比例 / fixed=固定金额
  slippageValue?: number; // 滑点：percent 时万分比，fixed 时元
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

// 将出场方式归一化为 threshold/cross，非法回退 threshold
function normalizeExitType(v: unknown): "threshold" | "cross" {
  return v === "cross" ? "cross" : "threshold";
}

// 将持仓时间上限钳制为 0-1000 的非负整数，非法回退 0（不限）
function clampHoldingDays(v: number | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1000, Math.max(0, Math.floor(n)));
}

// 将仓位计算方式归一化为 fixed/kelly/atr，非法回退 fixed
function normalizeSizing(v: unknown): "fixed" | "kelly" | "atr" {
  return v === "kelly" || v === "atr" ? v : "fixed";
}

// 将止损方式归一化为 fixed/trailing/atr，非法回退 fixed
function normalizeStopType(v: unknown): "fixed" | "trailing" | "atr" {
  return v === "trailing" || v === "atr" ? v : "fixed";
}

// 将止盈方式归一化为 fixed/trailing，非法回退 fixed
function normalizeTakeType(v: unknown): "fixed" | "trailing" {
  return v === "trailing" ? "trailing" : "fixed";
}

// 将滑点方式归一化为 percent/fixed，非法回退 percent
function normalizeSlippageType(v: unknown): "percent" | "fixed" {
  return v === "fixed" ? "fixed" : "percent";
}

// 将数值钳制到 [min, max]（保留小数），非法回退默认值
function clampNum(v: number | undefined, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// 将整数钳制到 [min, max]，非法回退默认值
function clampInt(v: number | undefined, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// 默认风控参数（对齐 quant composite 引擎 / backtest 页默认值）
const RISK_DEFAULTS = {
  entry: 65,
  exit: 30,
  positionSize: 95,
  stopLoss: 8,
  takeProfit: 20,
  stopType: "fixed" as const,
  trailingStop: 10,
  atrStopMultiple: 2,
  takeType: "fixed" as const,
  trailingTake: 10,
  maxLossPerTrade: 0,
  maxConsecutiveLosses: 0,
};

// 默认仓位层参数（对齐 quant composite 引擎 position 默认值）
const POSITION_DEFAULTS = {
  sizing: "fixed" as const,
  baseSize: 95,
  maxSize: 95,
  totalCap: 100,
  maxPositions: 1,
  kellyFraction: 50,
  atrPeriod: 14,
  atrRiskBudget: 2,
  pyramiding: false,
  firstEntry: 50,
  addOnProfit: 5,
  addSize: 25,
  maxAdds: 2,
  partialExit: false,
  partialExitRatio: 50,
};

// 默认成本层参数（对齐 quant 引擎 cn_stock_sim 默认成本）
const COST_DEFAULTS = {
  commissionRate: 3, // 万3 = 0.03%
  stampTaxRate: 10, // 万10 = 千1 = 0.1%
  transferFeeRate: 0.1, // 万0.1
  minCommission: 5, // 元
  slippageType: "percent" as const,
  slippageValue: 2, // 万2 = 0.02%
};

// 将输入值钳制到 0-100 百分比，非法值回退默认
function clampPct(v: number | undefined, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(100, Math.max(0, n));
}

// 组装对齐 quant composite 引擎的 configJson（factors + combine + entry/exit/risk/position）
function buildConfigJson(
  factors: { name: string; value: number; weight: number; direction: 1 | -1 }[],
  risk: StrategyRiskInput,
  entry: StrategyEntryInput,
  exit: StrategyExitInput,
  position: StrategyPositionInput,
  combine: CombineMode,
  cost: StrategyCostInput,
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
  exit: { type: "threshold" | "cross"; value: number; maxHoldingDays: number };
  position: {
    sizing: "fixed" | "kelly" | "atr";
    baseSize: number;
    maxSize: number;
    totalCap: number;
    maxPositions: number;
    kellyFraction: number;
    atrPeriod: number;
    atrRiskBudget: number;
    pyramiding: boolean;
    firstEntry: number;
    addOnProfit: number;
    addSize: number;
    maxAdds: number;
    partialExit: boolean;
    partialExitRatio: number;
  };
  risk: {
    positionSize: number;
    stopLoss: number;
    takeProfit: number;
    stopType: "fixed" | "trailing" | "atr";
    trailingStop: number;
    atrStopMultiple: number;
    takeType: "fixed" | "trailing";
    trailingTake: number;
    maxLossPerTrade: number;
    maxConsecutiveLosses: number;
  };
  cost: {
    commissionRate: number;
    stampTaxRate: number;
    transferFeeRate: number;
    minCommission: number;
    slippageType: "percent" | "fixed";
    slippageValue: number;
  };
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
    exit: {
      type: normalizeExitType(exit.exitType),
      value: clampPct(risk.exit, RISK_DEFAULTS.exit),
      maxHoldingDays: clampHoldingDays(exit.maxHoldingDays),
    },
    position: {
      sizing: normalizeSizing(position.sizing),
      baseSize: clampPct(position.baseSize, POSITION_DEFAULTS.baseSize),
      maxSize: clampPct(position.maxSize, POSITION_DEFAULTS.maxSize),
      totalCap: clampPct(position.totalCap, POSITION_DEFAULTS.totalCap),
      maxPositions: clampInt(position.maxPositions, POSITION_DEFAULTS.maxPositions, 1, 50),
      kellyFraction: clampPct(position.kellyFraction, POSITION_DEFAULTS.kellyFraction),
      atrPeriod: clampInt(position.atrPeriod, POSITION_DEFAULTS.atrPeriod, 5, 60),
      atrRiskBudget: clampPct(position.atrRiskBudget, POSITION_DEFAULTS.atrRiskBudget),
      pyramiding: !!position.pyramiding,
      firstEntry: clampPct(position.firstEntry, POSITION_DEFAULTS.firstEntry),
      addOnProfit: clampPct(position.addOnProfit, POSITION_DEFAULTS.addOnProfit),
      addSize: clampPct(position.addSize, POSITION_DEFAULTS.addSize),
      maxAdds: clampInt(position.maxAdds, POSITION_DEFAULTS.maxAdds, 1, 10),
      partialExit: !!position.partialExit,
      partialExitRatio: clampPct(position.partialExitRatio, POSITION_DEFAULTS.partialExitRatio),
    },
    risk: {
      positionSize: clampPct(risk.positionSize, RISK_DEFAULTS.positionSize),
      stopLoss: clampPct(risk.stopLoss, RISK_DEFAULTS.stopLoss),
      takeProfit: clampPct(risk.takeProfit, RISK_DEFAULTS.takeProfit),
      stopType: normalizeStopType(risk.stopType),
      trailingStop: clampPct(risk.trailingStop, RISK_DEFAULTS.trailingStop),
      atrStopMultiple: clampInt(risk.atrStopMultiple, RISK_DEFAULTS.atrStopMultiple, 1, 10),
      takeType: normalizeTakeType(risk.takeType),
      trailingTake: clampPct(risk.trailingTake, RISK_DEFAULTS.trailingTake),
      maxLossPerTrade: clampPct(risk.maxLossPerTrade, RISK_DEFAULTS.maxLossPerTrade),
      maxConsecutiveLosses: clampInt(
        risk.maxConsecutiveLosses,
        RISK_DEFAULTS.maxConsecutiveLosses,
        0,
        20,
      ),
    },
    cost: {
      commissionRate: clampNum(cost.commissionRate, COST_DEFAULTS.commissionRate, 0, 100),
      stampTaxRate: clampNum(cost.stampTaxRate, COST_DEFAULTS.stampTaxRate, 0, 100),
      transferFeeRate: clampNum(cost.transferFeeRate, COST_DEFAULTS.transferFeeRate, 0, 100),
      minCommission: clampNum(cost.minCommission, COST_DEFAULTS.minCommission, 0, 1000),
      slippageType: normalizeSlippageType(cost.slippageType),
      slippageValue: clampNum(
        cost.slippageValue,
        COST_DEFAULTS.slippageValue,
        0,
        normalizeSlippageType(cost.slippageType) === "fixed" ? 1000 : 100,
      ),
    },
  };
}

// GET /api/v1/strategies — 公开策略 + 当前用户策略
strategiesRoute.get("/", async (c) => {
  await ensureStrategiesSeeded();
  await ensureAtrusStrategiesSeeded();
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
    StrategyEntryInput &
    StrategyExitInput &
    StrategyPositionInput &
    StrategyCostInput;
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
      configJson: buildConfigJson(
        factors,
        body,
        body,
        body,
        body,
        normalizeCombine(body.combine),
        body,
      ),
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
    StrategyEntryInput &
    StrategyExitInput &
    StrategyPositionInput &
    StrategyCostInput;

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
    exit?: { type?: "threshold" | "cross"; value?: number; maxHoldingDays?: number };
    position?: {
      sizing?: "fixed" | "kelly" | "atr";
      baseSize?: number;
      maxSize?: number;
      totalCap?: number;
      maxPositions?: number;
      kellyFraction?: number;
      atrPeriod?: number;
      atrRiskBudget?: number;
      pyramiding?: boolean;
      firstEntry?: number;
      addOnProfit?: number;
      addSize?: number;
      maxAdds?: number;
      partialExit?: boolean;
      partialExitRatio?: number;
    };
    risk?: {
      positionSize?: number;
      stopLoss?: number;
      takeProfit?: number;
      stopType?: "fixed" | "trailing" | "atr";
      trailingStop?: number;
      atrStopMultiple?: number;
      takeType?: "fixed" | "trailing";
      trailingTake?: number;
      maxLossPerTrade?: number;
      maxConsecutiveLosses?: number;
    };
    cost?: {
      commissionRate?: number;
      stampTaxRate?: number;
      transferFeeRate?: number;
      minCommission?: number;
      slippageType?: "percent" | "fixed";
      slippageValue?: number;
    };
  };
  const nextFactors = (factors && factors.length > 0 ? factors : (prev.factors ?? [])).map((f) => ({
    ...f,
    direction: f.direction === -1 ? (-1 as const) : (1 as const),
  }));
  const nextCombine = normalizeCombine(body.combine ?? prev.combine);
  const nextEntry: StrategyEntryInput = {
    entryType: body.entryType ?? prev.entry?.type,
    volumeConfirm: body.volumeConfirm ?? prev.entry?.volumeConfirm,
    limitFilter: body.limitFilter ?? prev.entry?.limitFilter,
    stFilter: body.stFilter ?? prev.entry?.stFilter,
    marketFilter: body.marketFilter ?? prev.entry?.marketFilter,
  };
  const nextExit: StrategyExitInput = {
    exitType: body.exitType ?? prev.exit?.type,
    maxHoldingDays: body.maxHoldingDays ?? prev.exit?.maxHoldingDays,
  };
  const nextPosition: StrategyPositionInput = {
    sizing: body.sizing ?? prev.position?.sizing,
    baseSize: body.baseSize ?? prev.position?.baseSize,
    maxSize: body.maxSize ?? prev.position?.maxSize,
    totalCap: body.totalCap ?? prev.position?.totalCap,
    maxPositions: body.maxPositions ?? prev.position?.maxPositions,
    kellyFraction: body.kellyFraction ?? prev.position?.kellyFraction,
    atrPeriod: body.atrPeriod ?? prev.position?.atrPeriod,
    atrRiskBudget: body.atrRiskBudget ?? prev.position?.atrRiskBudget,
    pyramiding: body.pyramiding ?? prev.position?.pyramiding,
    firstEntry: body.firstEntry ?? prev.position?.firstEntry,
    addOnProfit: body.addOnProfit ?? prev.position?.addOnProfit,
    addSize: body.addSize ?? prev.position?.addSize,
    maxAdds: body.maxAdds ?? prev.position?.maxAdds,
    partialExit: body.partialExit ?? prev.position?.partialExit,
    partialExitRatio: body.partialExitRatio ?? prev.position?.partialExitRatio,
  };
  const nextCost: StrategyCostInput = {
    commissionRate: body.commissionRate ?? prev.cost?.commissionRate,
    stampTaxRate: body.stampTaxRate ?? prev.cost?.stampTaxRate,
    transferFeeRate: body.transferFeeRate ?? prev.cost?.transferFeeRate,
    minCommission: body.minCommission ?? prev.cost?.minCommission,
    slippageType: body.slippageType ?? prev.cost?.slippageType,
    slippageValue: body.slippageValue ?? prev.cost?.slippageValue,
  };
  const hasRiskUpdate =
    body.entry !== undefined ||
    body.exit !== undefined ||
    body.positionSize !== undefined ||
    body.stopLoss !== undefined ||
    body.takeProfit !== undefined ||
    body.stopType !== undefined ||
    body.trailingStop !== undefined ||
    body.atrStopMultiple !== undefined ||
    body.takeType !== undefined ||
    body.trailingTake !== undefined ||
    body.maxLossPerTrade !== undefined ||
    body.maxConsecutiveLosses !== undefined;
  const hasEntryUpdate =
    body.entryType !== undefined ||
    body.volumeConfirm !== undefined ||
    body.limitFilter !== undefined ||
    body.stFilter !== undefined ||
    body.marketFilter !== undefined;
  const hasExitUpdate = body.exitType !== undefined || body.maxHoldingDays !== undefined;
  const hasPositionUpdate =
    body.sizing !== undefined ||
    body.baseSize !== undefined ||
    body.maxSize !== undefined ||
    body.totalCap !== undefined ||
    body.maxPositions !== undefined ||
    body.kellyFraction !== undefined ||
    body.atrPeriod !== undefined ||
    body.atrRiskBudget !== undefined ||
    body.pyramiding !== undefined ||
    body.firstEntry !== undefined ||
    body.addOnProfit !== undefined ||
    body.addSize !== undefined ||
    body.maxAdds !== undefined ||
    body.partialExit !== undefined ||
    body.partialExitRatio !== undefined;
  const hasCostUpdate =
    body.commissionRate !== undefined ||
    body.stampTaxRate !== undefined ||
    body.transferFeeRate !== undefined ||
    body.minCommission !== undefined ||
    body.slippageType !== undefined ||
    body.slippageValue !== undefined;
  const hasConfigUpdate =
    Array.isArray(body.factors) ||
    body.combine !== undefined ||
    hasRiskUpdate ||
    hasEntryUpdate ||
    hasExitUpdate ||
    hasPositionUpdate ||
    hasCostUpdate;
  const configJson = buildConfigJson(
    nextFactors,
    {
      entry: body.entry ?? prev.entry?.value,
      exit: body.exit ?? prev.exit?.value,
      positionSize: body.positionSize ?? prev.risk?.positionSize,
      stopLoss: body.stopLoss ?? prev.risk?.stopLoss,
      takeProfit: body.takeProfit ?? prev.risk?.takeProfit,
      stopType: body.stopType ?? prev.risk?.stopType,
      trailingStop: body.trailingStop ?? prev.risk?.trailingStop,
      atrStopMultiple: body.atrStopMultiple ?? prev.risk?.atrStopMultiple,
      takeType: body.takeType ?? prev.risk?.takeType,
      trailingTake: body.trailingTake ?? prev.risk?.trailingTake,
      maxLossPerTrade: body.maxLossPerTrade ?? prev.risk?.maxLossPerTrade,
      maxConsecutiveLosses: body.maxConsecutiveLosses ?? prev.risk?.maxConsecutiveLosses,
    },
    nextEntry,
    nextExit,
    nextPosition,
    nextCombine,
    nextCost,
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
