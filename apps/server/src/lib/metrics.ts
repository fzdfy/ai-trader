/**
 * metrics — 市场指标口径域（stock_metric 表配套）
 *
 * 让「主线」这类指标的评分口径成为可定义、可持久化、可版本化的配置：
 *   - 每种指标类型（kind）在 METRIC_KINDS 中声明一份「口径定义」（维度/子指标/归一化/候选范围…）；
 *   - spec 是该定义下的一组实例取值（weights / subs / norm / candidateScope / minScore / topN）；
 *   - validateSpec 保证合法性（维度权重和=100、每维子指标权重和=该维权重等）；
 *   - renderInstruction 把 spec 渲染成自然语言「口径说明」（给 Agent 与前端预览，保证两者看到一致口径）；
 *   - loadDefaultMetric 读取某 kind 的当前默认口径，无则自动种子默认配置（同 ensureInstructions 模式）。
 *
 * 口径定义与规则引擎解耦：review-tools 的 getMainlineData 只按 spec 的数值计算，
 * 不关心是哪套预设——换口径即换 spec。
 */

import { desc, eq, and } from "drizzle-orm";
import { db } from "../db";
import { stockMetric } from "../db/schema";

// ---------------------------------------------------------------------------
// 口径定义（每种 kind 一份；sub 的 scale 说明该子指标如何参与打分）
// ---------------------------------------------------------------------------

export type SubScale =
  /** 候选内 min-max 归一化（可 clipAtZero 把负值压到 0）后 × 子指标权重 */
  | { type: "norm"; clipAtZero?: boolean }
  /** 有自然上限的比率：raw / max × 子指标权重（如 近5日上涨天数 / 5） */
  | { type: "ratio"; max: number }
  /** 反向比率（越低越好）：(1 - raw) × 子指标权重（如 炸板率） */
  | { type: "inverseRatio" };

export interface MetricSubDef {
  key: string;
  label: string;
  /** 默认子指标权重（满分），默认 spec 由此生成 */
  weightDefault: number;
  scale: SubScale;
}

export interface MetricDimDef {
  key: string;
  label: string;
  /** 默认维度权重（满分），维度权重和必须=100 */
  weightDefault: number;
  subs: MetricSubDef[];
}

export interface MetricKindDef {
  kind: string;
  displayName: string;
  /** 一句话说明该指标口径回答什么问题（前端展示） */
  description: string;
  dims: MetricDimDef[];
  /** 支持的归一化方式（默认值取第一个） */
  normOptions: Array<{ value: string; label: string }>;
  /** 支持的候选板块范围（默认值取第一个） */
  candidateScopes: Array<{ value: string; label: string }>;
  /** 展示阈值默认值 */
  minScoreDefault: number;
  topNDefault: number;
}

// ---------------------------------------------------------------------------
// 口径定义注册表
// ---------------------------------------------------------------------------

/** 主线：方向持续性 + 资金聚焦 + 龙头梯队 + 赚钱效应 + 题材催化 + 机构/游资确认，总分 100 */
export const MAINLINE_DEF: MetricKindDef = {
  kind: "mainline",
  displayName: "主线（六维加权评分）",
  description: "识别当日资金聚焦、具备持续性、被题材与机构共同确认的主线行业板块，总分 100。",
  dims: [
    {
      key: "direction",
      label: "方向持续性",
      weightDefault: 18,
      subs: [
        {
          key: "sum3d",
          label: "近3日累计涨幅",
          weightDefault: 10,
          scale: { type: "norm", clipAtZero: true },
        },
        {
          key: "upDays5",
          label: "近5日上涨天数",
          weightDefault: 8,
          scale: { type: "ratio", max: 5 },
        },
      ],
    },
    {
      key: "fund",
      label: "资金聚焦",
      weightDefault: 20,
      subs: [
        {
          key: "netInflow",
          label: "主力净流入额",
          weightDefault: 10,
          scale: { type: "norm", clipAtZero: true },
        },
        {
          key: "netPct",
          label: "主力净流入占比",
          weightDefault: 6,
          scale: { type: "norm", clipAtZero: true },
        },
        {
          key: "fund5d",
          label: "5日主力净流入",
          weightDefault: 4,
          scale: { type: "norm", clipAtZero: true },
        },
      ],
    },
    {
      key: "leader",
      label: "龙头梯队",
      weightDefault: 18,
      subs: [
        {
          key: "limitUpCount",
          label: "涨停家数",
          weightDefault: 6,
          scale: { type: "norm" },
        },
        {
          key: "maxConsec",
          label: "最高连板数",
          weightDefault: 6,
          scale: { type: "norm" },
        },
        {
          key: "sealType",
          label: "封板强度",
          weightDefault: 6,
          scale: { type: "norm" },
        },
      ],
    },
    {
      key: "effect",
      label: "赚钱效应",
      weightDefault: 12,
      subs: [
        {
          key: "boardPct",
          label: "板块涨幅",
          weightDefault: 5,
          scale: { type: "norm", clipAtZero: true },
        },
        {
          key: "upRatio",
          label: "上涨家数占比",
          weightDefault: 4,
          scale: { type: "ratio", max: 1 },
        },
        {
          key: "bustRate",
          label: "炸板率",
          weightDefault: 3,
          scale: { type: "inverseRatio" },
        },
      ],
    },
    {
      key: "theme",
      label: "题材催化",
      weightDefault: 16,
      subs: [
        {
          key: "themeConcentration",
          label: "题材涨停集中度",
          weightDefault: 10,
          scale: { type: "ratio", max: 1 },
        },
        {
          key: "hotReasonCount",
          label: "题材归因强度",
          weightDefault: 6,
          scale: { type: "norm" },
        },
      ],
    },
    {
      key: "dragon",
      label: "机构/游资确认",
      weightDefault: 16,
      subs: [
        {
          key: "dragonNetBuy",
          label: "龙虎榜净买额",
          weightDefault: 10,
          scale: { type: "norm", clipAtZero: true },
        },
        {
          key: "dragonCount",
          label: "上榜家数",
          weightDefault: 6,
          scale: { type: "norm" },
        },
      ],
    },
  ],
  normOptions: [
    { value: "minmax-in-candidate", label: "候选板块内 min-max 归一化" },
  ],
  candidateScopes: [{ value: "limitup-industry", label: "当日涨停池涉及的行业板块" }],
  minScoreDefault: 0,
  topNDefault: 5,
};

/**
 * 市场情绪温度：涨停规模 + 封板质量 + 连板高度，总分 100。
 *
 * 与「主线」的差异：主线是对「候选行业板块」做横向排名打分（norm 在候选内归一化）；
 * 市场情绪是「全市场单日」一个标量温度（0~100），子指标用绝对阈值比例（ratio / inverseRatio），
 * 不做候选间归一化。数据全部来自 limit_up_pool（涨停池）单表，口径可配置。
 */
export const MARKET_EMOTION_DEF: MetricKindDef = {
  kind: "market-emotion",
  displayName: "市场情绪温度",
  description: "衡量当日短线情绪冷热：涨停家数、封板质量、连板高度加权成 0~100 温度。",
  dims: [
    {
      key: "scale",
      label: "涨停规模",
      weightDefault: 40,
      subs: [
        {
          key: "emotionLimitUpCount",
          label: "涨停家数",
          weightDefault: 40,
          scale: { type: "ratio", max: 80 },
        },
      ],
    },
    {
      key: "quality",
      label: "封板质量",
      weightDefault: 35,
      subs: [
        {
          key: "emotionBustRate",
          label: "炸板率",
          weightDefault: 20,
          scale: { type: "inverseRatio" },
        },
        {
          key: "emotionSealStrength",
          label: "封板强度",
          weightDefault: 15,
          scale: { type: "ratio", max: 5 },
        },
      ],
    },
    {
      key: "height",
      label: "连板高度",
      weightDefault: 25,
      subs: [
        {
          key: "emotionMaxConsec",
          label: "最高连板数",
          weightDefault: 25,
          scale: { type: "ratio", max: 10 },
        },
      ],
    },
  ],
  normOptions: [
    { value: "absolute-ratio", label: "绝对阈值比例打分（涨停 80 家 / 封板强度 5 分 / 连板 10 板封顶）" },
  ],
  candidateScopes: [{ value: "whole-market", label: "全市场（按交易日聚合）" }],
  minScoreDefault: 0,
  topNDefault: 1,
};

/** 口径定义注册表：新增指标类型时在此登记 */
export const METRIC_KINDS: MetricKindDef[] = [MAINLINE_DEF, MARKET_EMOTION_DEF];
export const METRIC_KIND_MAP: Record<string, MetricKindDef> = Object.fromEntries(
  METRIC_KINDS.map((d) => [d.kind, d]),
);

/** 所有 kind 的扁平子指标（key → scale），规则引擎打分用 */
export const SUB_SCALE_MAP: Record<string, SubScale> = Object.fromEntries(
  METRIC_KINDS.flatMap((def) => def.dims.flatMap((dim) => dim.subs.map((s) => [s.key, s.scale]))),
);

/** 维度 key → 所属 kind（唯一性校验：同名子指标不得跨 kind 冲突） */
// 目前仅主线一种 kind，暂不做跨 kind 冲突断言；新增 kind 时若与 SUB_SCALE_MAP 冲突需改名。

// ---------------------------------------------------------------------------
// MetricSpec（实例取值）与校验
// ---------------------------------------------------------------------------

export interface MetricSpec {
  /** 维度权重：{ dimKey: 0~100 }，和必须=100 */
  weights: Record<string, number>;
  /** 子指标权重：{ subKey: 0~100 }，每维内子指标权重和=该维权重 */
  subs: Record<string, number>;
  /** 归一化方式（取自 normOptions） */
  norm: string;
  /** 候选板块范围（取自 candidateScopes） */
  candidateScope: string;
  /** 综合分低于该值的主线板块不展示（0~100，0=不过滤） */
  minScore: number;
  /** 返回前 N 条主线（1~10） */
  topN: number;
}

/** 由口径定义生成默认 spec（维度默认权重 / 子指标默认权重） */
export function buildDefaultSpec(def: MetricKindDef): MetricSpec {
  const weights: Record<string, number> = {};
  const subs: Record<string, number> = {};
  for (const dim of def.dims) {
    weights[dim.key] = dim.weightDefault;
    for (const sub of dim.subs) subs[sub.key] = sub.weightDefault;
  }
  return {
    weights,
    subs,
    norm: def.normOptions[0]!.value,
    candidateScope: def.candidateScopes[0]!.value,
    minScore: def.minScoreDefault,
    topN: def.topNDefault,
  };
}

/** 校验 spec，返回错误信息；合法返回 null */
export function validateSpec(def: MetricKindDef, spec: MetricSpec): string | null {
  const dimKeys = new Set(def.dims.map((d) => d.key));
  const subKeys = new Set(def.dims.flatMap((d) => d.subs.map((s) => s.key)));
  const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
  const inRange = (v: number, min: number, max: number) => v >= min && v <= max;

  // 维度权重：必须恰好覆盖该 kind 的全部维度
  if (!spec || typeof spec !== "object") return "spec 不能为空";
  const weights = spec.weights ?? {};
  const weightKeys = Object.keys(weights);
  if (
    weightKeys.length !== dimKeys.size ||
    weightKeys.some((k) => !dimKeys.has(k) || !isInt(weights[k]) || !inRange(weights[k], 0, 100))
  ) {
    return `维度权重必须覆盖且仅覆盖 ${[...dimKeys].join("/")}，且为 0~100 整数`;
  }
  const weightSum = weightKeys.reduce((s, k) => s + weights[k]!, 0);
  if (weightSum !== 100) return `维度权重之和必须=100（当前 ${weightSum}）`;

  // 子指标权重：必须恰好覆盖全部子指标；每维内子指标和=该维权重
  const subIn = spec.subs ?? {};
  const subInKeys = Object.keys(subIn);
  if (
    subInKeys.length !== subKeys.size ||
    subInKeys.some((k) => !subKeys.has(k) || !isInt(subIn[k]) || !inRange(subIn[k], 0, 100))
  ) {
    return `子指标权重必须覆盖全部子指标，且为 0~100 整数`;
  }
  for (const dim of def.dims) {
    const dimSubSum = dim.subs.reduce((s, sub) => s + subIn[sub.key]!, 0);
    if (dimSubSum !== weights[dim.key]) {
      return `「${dim.label}」的子指标权重和=${dimSubSum}，应等于该维度权重 ${weights[dim.key]}`;
    }
  }

  if (!def.normOptions.some((o) => o.value === spec.norm)) return "归一化方式不支持";
  if (!def.candidateScopes.some((o) => o.value === spec.candidateScope)) return "候选板块范围不支持";
  if (!isInt(spec.minScore) || !inRange(spec.minScore, 0, 100)) return "minScore 需为 0~100 整数";
  if (!isInt(spec.topN) || !inRange(spec.topN, 1, 10)) return "topN 需为 1~10 整数";
  return null;
}

// ---------------------------------------------------------------------------
// 口径说明渲染（给 Agent 与前端预览，保证与 spec 一致）
// ---------------------------------------------------------------------------

/** 把 spec 渲染成自然语言「口径说明」，随复盘注入给总结 Agent，前端编辑时预览 */
export function renderInstruction(
  def: MetricKindDef,
  spec: MetricSpec,
  meta?: { preset?: string; version?: number },
): string {
  const head = meta
    ? `当前${def.displayName}口径（${meta.preset ?? "default"} v${meta.version ?? 1}）：`
    : `当前${def.displayName}口径：`;
  const parts = def.dims.map((dim) => {
    const subTexts = dim.subs.map((sub) => {
      const w = spec.subs[sub.key] ?? 0;
      if (w <= 0) return "";
      const neg = sub.scale.type === "inverseRatio" ? "（反向）" : "";
      return `含${sub.label}${w}分${neg}`;
    });
    const active = subTexts.filter(Boolean);
    const weight = spec.weights[dim.key] ?? 0;
    return `${dim.label}${weight}分` + (active.length ? `（${active.join("+")}）` : "");
  });
  const normLabel = def.normOptions.find((o) => o.value === spec.norm)?.label ?? spec.norm;
  const scopeLabel = def.candidateScopes.find((o) => o.value === spec.candidateScope)?.label ?? spec.candidateScope;
  return (
    `${head}总分 100 = ${parts.join("＋")}；` +
    `候选范围：${scopeLabel}；归一化：${normLabel}；` +
    `综合得分低于 ${spec.minScore} 的主线不展示，返回前 ${spec.topN} 名。`
  );
}

// ---------------------------------------------------------------------------
// DB 读写（stock_metric）
// ---------------------------------------------------------------------------

/** 序列化后的口径记录（供 API / 前端 / Agent 使用） */
export interface MetricRecord {
  kind: string;
  preset: string;
  version: number;
  displayName: string;
  spec: MetricSpec;
  instruction: string;
  isDefault: boolean;
}

/** def → 可序列化的「口径元数据」，前端据此渲染通用编辑表单 */
export function kindDefMeta(def: MetricKindDef) {
  return {
    kind: def.kind,
    displayName: def.displayName,
    description: def.description,
    dims: def.dims.map((dim) => ({
      key: dim.key,
      label: dim.label,
      weightDefault: dim.weightDefault,
      subs: dim.subs.map((s) => ({ key: s.key, label: s.label, weightDefault: s.weightDefault })),
    })),
    normOptions: def.normOptions,
    candidateScopes: def.candidateScopes,
    minScoreDefault: def.minScoreDefault,
    topNDefault: def.topNDefault,
  };
}

function toRecord(row: typeof stockMetric.$inferSelect): MetricRecord {
  return {
    kind: row.kind,
    preset: row.preset,
    version: row.version,
    displayName: row.displayName,
    spec: row.spec as MetricSpec,
    instruction: row.instruction,
    isDefault: row.isDefault,
  };
}

/** 列出某 kind 的全部预设口径（默认在前） */
export async function listMetrics(kind: string): Promise<MetricRecord[]> {
  const rows = await db
    .select()
    .from(stockMetric)
    .where(eq(stockMetric.kind, kind))
    .orderBy(desc(stockMetric.isDefault), desc(stockMetric.updatedAt));
  return rows.map(toRecord);
}

/**
 * 读取某 kind 的当前默认口径；库中无任何该 kind 记录时，自动种子写入默认配置
 * （与 ensureInstructions 同款模式，保证首次使用即有可编辑基线）。
 */
export async function loadDefaultMetric(kind: string): Promise<MetricRecord> {
  const def = METRIC_KIND_MAP[kind];
  if (!def) throw new Error(`未知指标口径 kind: ${kind}`);

  const rows = await db
    .select()
    .from(stockMetric)
    .where(eq(stockMetric.kind, kind))
    .orderBy(desc(stockMetric.isDefault), desc(stockMetric.updatedAt))
    .limit(1);
  const row = rows[0];
  if (row) return toRecord(row);

  // 种子默认口径
  const spec = buildDefaultSpec(def);
  const preset = "default";
  const version = 1;
  const record: Omit<MetricRecord, "kind"> & { kind: string } = {
    kind,
    preset,
    version,
    displayName: `${def.displayName}（默认）`,
    spec,
    instruction: renderInstruction(def, spec, { preset, version }),
    isDefault: true,
  };
  await db
    .insert(stockMetric)
    .values({
      kind: record.kind,
      preset: record.preset,
      version: record.version,
      displayName: record.displayName,
      spec: record.spec,
      instruction: record.instruction,
      isDefault: true,
    })
    .onConflictDoNothing({ target: [stockMetric.kind, stockMetric.preset] });
  return record;
}

/**
 * 保存（upsert）某 kind+preset 的口径配置，返回保存后的记录。
 *
 * 逻辑：校验 spec → version 管理（spec 变更 +1，未变保持）→
 * isDefault=true 时先把同 kind 其余 preset 置为非默认（满足 partial unique）→ upsert。
 * spec 校验失败抛 Error（携带可读中文信息），供 API 直接转成 400。
 */
export async function saveMetric(input: {
  kind: string;
  preset: string;
  spec?: unknown;
  displayName?: string;
  isDefault?: boolean;
}): Promise<MetricRecord> {
  const def = METRIC_KIND_MAP[input.kind];
  if (!def) throw new Error(`未知指标口径 kind: ${input.kind}`);

  const spec: MetricSpec = input.spec ? (input.spec as MetricSpec) : buildDefaultSpec(def);
  const errMsg = validateSpec(def, spec);
  if (errMsg) throw new Error(errMsg);

  // version：spec 未变则不升级；变更则 +1（口径演进可追溯）
  const existingRows = await db
    .select()
    .from(stockMetric)
    .where(eq(stockMetric.kind, input.kind));
  const existing = existingRows.find((r) => r.preset === input.preset);
  const specChanged = !existing || JSON.stringify(existing.spec) !== JSON.stringify(spec);
  const version = !existing ? 1 : specChanged ? existing.version + 1 : existing.version;

  const displayName =
    input.displayName?.trim() ||
    existing?.displayName ||
    `${def.displayName}（${input.preset}）`;
  const isDefault = existing
    ? (input.isDefault ?? existing.isDefault)
    : (input.isDefault ?? false);
  const instruction = renderInstruction(def, spec, {
    preset: input.preset,
    version,
  });

  await db.transaction(async (tx) => {
    // 新默认：先把该 kind 其余 preset 置为非默认，满足 partial unique（kind + is_default=true）
    if (isDefault) {
      await tx.update(stockMetric).set({ isDefault: false }).where(eq(stockMetric.kind, input.kind));
    }
    await tx
      .insert(stockMetric)
      .values({
        kind: input.kind,
        preset: input.preset,
        version,
        displayName,
        spec,
        instruction,
        isDefault,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [stockMetric.kind, stockMetric.preset],
        set: {
          version,
          displayName,
          spec,
          instruction,
          isDefault,
          updatedAt: new Date(),
        },
      });
  });

  return {
    kind: input.kind,
    preset: input.preset,
    version,
    displayName,
    spec,
    instruction,
    isDefault,
  };
}
