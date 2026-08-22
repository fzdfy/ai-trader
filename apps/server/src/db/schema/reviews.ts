import {
  pgTable,
  text,
  timestamp,
  date,
  jsonb,
  bigserial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
