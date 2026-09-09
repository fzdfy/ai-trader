import {
  pgTable,
  text,
  timestamp,
  date,
  jsonb,
  bigserial,
  integer,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * review_skill — 复盘 skill（方法论提示词 + UI 模块配置）
 *
 * 定位：复盘 agent 的"可编辑技能"。前端可查看/编辑，agent 生成复盘时动态读取。
 * content 为 JSON：
 *   {
 *     instructions: string,          // 给复盘 agent 的方法论提示词
 *     sections: Array<{             // 前端按此顺序动态渲染各图表模块
 *       type: "fundflow" | "mainline" | "boardchange" | "limitup" | "stockpool" | "summary",
 *       title: string,
 *       chart: "fundflow" | "mainline" | "bar" | "table" | "stockpool" | "text"
 *     }>
 *   }
 *
 * 单行存储（name 主键，默认 "default"），编辑时覆盖更新。
 */
export const reviewSkill = pgTable("review_skill", {
  name: text("name").primaryKey(),
  content: jsonb("content").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * review_daily — 每日复盘结果（按交易日一份，可回放 / 重新生成覆盖）
 *
 * 生成时把「组装好的自描述 sections（含渲染数据）」整体快照落库，
 * 保证回放时即使行情数据已变化，复盘内容仍与生成时一致，且无需重新拼装。
 */
export const reviewDaily = pgTable("review_daily", {
  /** 复盘交易日（主键，一日一份） */
  date: date("date").primaryKey(),
  /** 组装后的自描述模块（含数据）：Array<{ type, title, chart, data }> */
  sections: jsonb("sections").notNull(),
  /** 总结文本（列表预览用） */
  summary: text("summary").notNull(),
  /** 生成时使用的 skill 快照 */
  skill: jsonb("skill").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * stock_metric — 市场指标口径表（可配置的「指标定义」，独立于复盘方法论）
 *
 * 定位：像「主线」这类指标，其评分口径（权重 / 子指标 / 归一化 / 候选范围 / 阈值）
 * 允许有不同的定义。把口径从代码硬编码提升为可持久化、可版本化的配置：
 *   - 规则引擎按 spec 实时计算（快、可复现）；
 *   - Agent 读取由 spec 渲染出的 instruction（自然语言口径说明），理解当前口径；
 *   - 前端可查看 / 编辑 spec（权重滑杆、子指标开关等），保存即生效；
 *   - 同一 kind 可并存多套 preset（预设），通过 isDefault 指定当前默认。
 *
 * spec 为结构化 JSON（不同 kind 用不同的 zod schema 校验，见 src/lib/metrics.ts）：
 *   mainline: { weights, subs, norm, candidateScope, minScore, topN }
 *
 * instruction 为 spec 渲染出的自然语言口径说明（给 Agent 与 UI 预览，保证两者一致）。
 * 写入策略：upsert（kind + preset 主键）；同 kind 的默认口径唯一（partial unique）。
 */
export const stockMetric = pgTable(
  "stock_metric",
  {
    /** 指标类型（如 mainline），决定 spec 的 zod schema */
    kind: text("kind").notNull(),
    /** 预设标识（如 default / limitup-tide），同 kind 下唯一 */
    preset: text("preset").notNull(),
    /** 口径结构版本（用于审计与对比） */
    version: integer("version").notNull().default(1),
    /** 展示名（前端表单标题用） */
    displayName: text("display_name").notNull(),
    /** 结构化口径 spec（zod 校验后落库） */
    spec: jsonb("spec").notNull(),
    /** spec 渲染出的自然语言口径说明（给 Agent / UI 预览） */
    instruction: text("instruction").notNull(),
    /** 是否为该 kind 的默认口径（同 kind 至多一个 true） */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.kind, table.preset] }),
    uniqueIndex("stock_metric_kind_default_unq")
      .on(table.kind)
      .where(sql`${table.isDefault} = true`),
  ],
);

/**
 * stock_pool — 选股池（落库表，区别于前端内存的"结果集合"）
 *
 * 从选股结果中勾选加入，按 date（加入交易日）记录，支持回放每日选股池。
 * 同日同标的唯一（date + symbol）。
 */
export const stockPool = pgTable(
  "stock_pool",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** 加入日期（交易日） */
    date: date("date").notNull(),
    /** 股票代码（标准 symbol，如 600519.SH） */
    symbol: text("symbol").notNull(),
    /** 股票名称 */
    name: text("name").notNull(),
    /** 来源（选股策略名） */
    source: text("source"),
    /** 选股综合得分 */
    score: text("score"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("stock_pool_date_idx").on(table.date),
    uniqueIndex("stock_pool_date_symbol_unq").on(table.date, table.symbol),
  ],
);
