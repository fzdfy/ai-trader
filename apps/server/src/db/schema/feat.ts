import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  bigserial,
  bigint,
  boolean,
  doublePrecision,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * 特征集定义表
 */
export const featureSet = pgTable("feature_set", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  definitionJson: jsonb("definition_json").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * 特征值表（按时间序列存储）
 */
export const featureValue = pgTable(
  "feature_value",
  {
    time: timestamp("time").notNull(),
    symbol: text("symbol").notNull(),
    featureSetId: integer("feature_set_id").notNull(),
    featuresJson: jsonb("features_json").notNull(),
    qualityFlag: integer("quality_flag").default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.time, table.symbol, table.featureSetId] }),
  }),
);

export const featureValueRelations = relations(featureValue, ({ one }) => ({
  featureSet: one(featureSet, {
    fields: [featureValue.featureSetId],
    references: [featureSet.id],
  }),
}));

/**
 * 因子注册表
 * 定义系统中所有可用的因子元数据，前端因子选择器从此表读取。
 */
export const factorRegistry = pgTable("factor_registry", {
  name: text("name").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  direction: integer("direction").notNull().default(1), // 1=正向 -1=反向
  defaultParams: jsonb("default_params"),
  description: text("description"),
  kind: text("kind").notNull().default("expression"), // 定义方式：expression=AKQuant 因子表达式 | python=Python 代码
  expression: text("expression"), // AKQuant 因子表达式（kind='expression' 时使用；内置因子由 seed 写入）
  code: text("code"), // Python 源码（kind='python' 时使用，须定义 compute(data)）
  createdBy: text("created_by").notNull().default("system"), // 创建者（system=内置，否则为用户 ID）
  isPublic: boolean("is_public").notNull().default(true), // 是否公开（系统因子默认公开）
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * 因子衰减曲线上的单个持有期样本。
 * horizon=持有期（交易日）；icMean/rankIcMean=该持有期的截面 IC / RankIC 均值；count=有效截面数。
 */
export interface FactorDecayPoint {
  horizon: number;
  icMean: number | null;
  rankIcMean: number | null;
  icir: number | null;
  count: number;
}

/** 分层换手率单层（第 1 层因子值最低） */
export interface FactorTurnoverLayer {
  layer: number;
  turnover: number | null;
}

/** 分位换手率：相邻两日同层成分股更替比例（越低越稳定、交易成本越低） */
export interface FactorTurnover {
  mean: number | null;
  byLayer: FactorTurnoverLayer[];
  count: number;
}

/** 因子秩自相关：相邻两日因子横截面排名 Spearman 相关的均值/标准差（越接近 1 越稳定） */
export interface FactorRankAutocorr {
  mean: number | null;
  std: number | null;
  count: number;
}

/** 多空组合 Alpha/Beta 回归（多空日收益对等权市场日收益 OLS） */
export interface FactorAlphaBeta {
  alpha: number | null;
  beta: number | null;
  rSquared: number | null;
  annualAlpha: number | null;
  count: number;
}

/** IC 正态性 QQ 采样点 */
export interface FactorIcQqPoint {
  theoretical: number;
  sample: number;
}

/** IC 序列正态性检验（偏度/峰度/Jarque-Bera 及 p 值 + QQ 点） */
export interface FactorIcNormality {
  skew: number | null;
  kurtosis: number | null;
  jarqueBera: number | null;
  pValue: number | null;
  count: number;
  qq: FactorIcQqPoint[];
}

/** 月度 IC：按自然月聚合的 IC / RankIC 均值 */
export interface FactorMonthlyIc {
  month: string;
  ic: number | null;
  rankIc: number | null;
  count: number;
}

/** 因子诊断明细（换手率分层 / 秩自相关 / Alpha-Beta / IC 正态性 / 月度 IC），供因子详情展示 */
export interface FactorDiagnostics {
  turnover: FactorTurnover;
  rankAutocorr: FactorRankAutocorr;
  alphaBeta: FactorAlphaBeta;
  icNormality: FactorIcNormality;
  monthlyIc: FactorMonthlyIc[];
}

/**
 * 因子检验结果表（批量落库）。
 * 一行 = 一个因子最近一次检验的快照（factor_name 主键，重算即 upsert 覆盖）。
 * 由「批量检验」任务写入，供因子列表页直接展示 IC / RankIC / ICIR / 多空等指标列。
 */
export const factorEvaluation = pgTable("factor_evaluation", {
  factorName: text("factor_name").primaryKey(),
  category: text("category").notNull(),
  horizon: integer("horizon").notNull().default(1),
  /** IC 均值（Pearson，因子值与未来收益的截面相关） */
  icMean: doublePrecision("ic_mean"),
  icStd: doublePrecision("ic_std"),
  /** ICIR = mean(IC) / std(IC) */
  icir: doublePrecision("icir"),
  /** t 值 = ICIR × sqrt(交易日数) */
  tStat: doublePrecision("t_stat"),
  /** IC > 0 的交易日占比 */
  icPositiveRatio: doublePrecision("ic_positive_ratio"),
  /** RankIC 均值（Spearman 秩相关） */
  rankIcMean: doublePrecision("rank_ic_mean"),
  rankIcir: doublePrecision("rank_icir"),
  /** 分层多空组合（最高层 - 最低层）汇总 */
  longShortCumRet: doublePrecision("long_short_cum_ret"),
  longShortAnnRet: doublePrecision("long_short_ann_ret"),
  longShortWinRate: doublePrecision("long_short_win_rate"),
  /** 有效截面交易日数 */
  sampleCount: integer("sample_count").notNull().default(0),
  symbols: integer("symbols").notNull().default(0),
  bars: integer("bars").notNull().default(0),
  startDate: text("start_date"),
  endDate: text("end_date"),
  /** 因子衰减曲线：各持有期的 IC / RankIC / ICIR（供跨因子「衰退对比」视图） */
  decay: jsonb("decay").$type<FactorDecayPoint[]>(),
  /** 分位换手率均值（相邻两日同层成分股更替比例，越低越稳定、交易成本越低） */
  turnoverMean: doublePrecision("turnover_mean"),
  /** 秩自相关均值（相邻两日因子排名 Spearman 相关，越接近 1 越稳定） */
  rankAutocorrMean: doublePrecision("rank_autocorr_mean"),
  /** 多空组合 Beta（对等权市场日收益的回归斜率，多空应接近 0） */
  longShortBeta: doublePrecision("long_short_beta"),
  /** 多空组合年化 Alpha（回归截距按 252 交易日复利年化） */
  longShortAlpha: doublePrecision("long_short_alpha"),
  /** IC 序列偏度（正态为 0） */
  icSkew: doublePrecision("ic_skew"),
  /** IC 序列峰度（正态为 3） */
  icKurtosis: doublePrecision("ic_kurtosis"),
  /** 诊断明细：换手率分层 / 秩自相关 / Alpha-Beta / IC 正态性 / 月度 IC（供因子详情展示） */
  diagnostics: jsonb("diagnostics").$type<FactorDiagnostics>(),
  /** 检验失败原因（成功时为空） */
  error: text("error"),
  elapsedMs: integer("elapsed_ms"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * AI 因子迭代轨迹表（路线 B 闭环轮次明细）。
 * 一行 = 一次迭代任务中的一轮（生成 → 校验 → 评价）；run_id 关联 job_run.id（jobType='factor-iterate'）。
 * 便于按 runId 独立查询整条轨迹，替代此前把轨迹塞进 job_run.message 的做法。
 */
export const factorIteration = pgTable(
  "factor_iteration",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** 关联的迭代任务 id（job_run.id） */
    runId: bigint("run_id", { mode: "number" }).notNull(),
    /** 轮次（从 1 开始） */
    round: integer("round").notNull(),
    /** 轮次结果：evaluated=评价成功 | invalid=表达式/运行校验未通过 | failed=生成或评价异常 | stopped=主动终止（无法生成/重复） */
    status: text("status").notNull(),
    expression: text("expression"),
    /** IC 均值（Pearson） */
    icMean: doublePrecision("ic_mean"),
    /** RankIC 均值（Spearman 秩相关） */
    rankIcMean: doublePrecision("rank_ic_mean"),
    icir: doublePrecision("icir"),
    tStat: doublePrecision("t_stat"),
    /** IC > 0 的交易日占比 */
    positiveRatio: doublePrecision("positive_ratio"),
    longShortAnnRet: doublePrecision("long_short_ann_ret"),
    longShortCumRet: doublePrecision("long_short_cum_ret"),
    /** 分层单调性（层序 vs 各层累计收益的 Spearman） */
    monotonicity: doublePrecision("monotonicity"),
    /** 衰退保留率（最长期持有期 |IC| / 最短持有期 |IC|） */
    retention: doublePrecision("retention"),
    /** 跨轮排序用的综合评分 */
    score: doublePrecision("score"),
    sampleCount: integer("sample_count"),
    symbols: integer("symbols"),
    /** 样本外占比（0~0.5）；0 表示未做切分 */
    validRatio: doublePrecision("valid_ratio"),
    /** 样本外起始交易日（YYYY-MM-DD）；未切分为空 */
    splitDate: text("split_date"),
    /** 样本外 IC 均值（Pearson） */
    validIcMean: doublePrecision("valid_ic_mean"),
    /** 样本外 RankIC 均值（Spearman 秩相关） */
    validRankIcMean: doublePrecision("valid_rank_ic_mean"),
    /** 样本外 ICIR = mean(IC) / std(IC) */
    validIcir: doublePrecision("valid_icir"),
    /** 样本外分层多空组合（最高层 - 最低层）汇总 */
    validLongShortAnnRet: doublePrecision("valid_long_short_ann_ret"),
    validLongShortCumRet: doublePrecision("valid_long_short_cum_ret"),
    /** 样本外有效截面交易日数 */
    validSampleCount: integer("valid_sample_count"),
    /** 非成功轮的原因说明（成功轮为空） */
    message: text("message"),
    /** 是否为本次任务的最佳轮 */
    isBest: boolean("is_best").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    unqRunRound: unique("factor_iteration_run_round_unq").on(table.runId, table.round),
  }),
);

/**
 * 用户自定义策略配置表
 * 一行 = 一个用户创建的多因子策略 JSON。
 */
export const strategyConfig = pgTable("strategy_config", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  configJson: jsonb("config_json").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(false), // 是否公开（用户策略默认私有）
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
