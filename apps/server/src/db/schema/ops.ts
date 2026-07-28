import {
  pgTable,
  text,
  timestamp,
  integer,
  bigserial,
  unique,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * 数据同步游标表
 */
export const syncCursor = pgTable(
  "sync_cursor",
  {
    source: text("source").notNull(),
    endpoint: text("endpoint").notNull(),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    cursorTime: timestamp("cursor_time"),
    cursorToken: text("cursor_token"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    unqSourceEndpointSymbolTimeframe: unique(
      "sync_cursor_source_endpoint_symbol_timeframe_unq",
    ).on(table.source, table.endpoint, table.symbol, table.timeframe),
  }),
);

/**
 * 任务执行记录表
 */
export const jobRun = pgTable("job_run", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobType: text("job_type").notNull(),
  symbol: text("symbol"),
  timeframe: text("timeframe"),
  rangeStart: timestamp("range_start"),
  rangeEnd: timestamp("range_end"),
  status: text("status").notNull().default("pending"),
  attempt: integer("attempt").notNull().default(1),
  error: text("error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
});

/**
 * 数据缺口检测表
 */
export const dataGap = pgTable("data_gap", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  symbol: text("symbol").notNull(),
  timeframe: text("timeframe").notNull(),
  missingStart: timestamp("missing_start").notNull(),
  missingEnd: timestamp("missing_end").notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  reason: text("reason"),
});

/**
 * 标的订阅管理表
 */
export const symbolSubscription = pgTable("symbol_subscription", {
  symbol: text("symbol").primaryKey(),
  tier: text("tier").notNull().default("standard"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * 用户自选表
 *
 * 每个用户对每只股票只能添加一次自选。
 * 写入策略：用户在前端点击添加/移除，实时 upsert / delete。
 */
export const watchlist = pgTable(
  "watchlist",
  {
    userId: text("user_id").notNull(),
    symbol: text("symbol").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    unqUserSymbol: unique("watchlist_user_symbol_unq").on(table.userId, table.symbol),
  }),
);
