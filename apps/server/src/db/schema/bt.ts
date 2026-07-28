import {
  pgTable,
  text,
  timestamp,
  jsonb,
  bigserial,
  integer,
  numeric,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * 回测运行记录表
 */
export const backtestRun = pgTable("backtest_run", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  strategyId: text("strategy_id").notNull(),
  paramsJson: jsonb("params_json").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  status: text("status").notNull().default("pending"),
  summaryJson: jsonb("summary_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const backtestRunRelations = relations(backtestRun, ({ many }) => ({
  tradeFills: many(tradeFill),
  positionDailies: many(positionDaily),
  equityCurves: many(equityCurve),
}));

/**
 * 交易成交记录表
 */
export const tradeFill = pgTable("trade_fill", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  runId: integer("run_id").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: numeric("price").notNull(),
  qty: numeric("qty").notNull(),
  fee: numeric("fee").notNull().default("0"),
  filledAt: timestamp("filled_at").notNull(),
});

export const tradeFillRelations = relations(tradeFill, ({ one }) => ({
  backtestRun: one(backtestRun, {
    fields: [tradeFill.runId],
    references: [backtestRun.id],
  }),
}));

/**
 * 每日持仓快照表
 */
export const positionDaily = pgTable(
  "position_daily",
  {
    runId: integer("run_id").notNull(),
    tradeDate: date("trade_date").notNull(),
    symbol: text("symbol").notNull(),
    qty: numeric("qty").notNull(),
    marketValue: numeric("market_value"),
    cost: numeric("cost"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.tradeDate, table.symbol] }),
  }),
);

export const positionDailyRelations = relations(positionDaily, ({ one }) => ({
  backtestRun: one(backtestRun, {
    fields: [positionDaily.runId],
    references: [backtestRun.id],
  }),
}));

/**
 * 权益曲线表
 */
export const equityCurve = pgTable(
  "equity_curve",
  {
    runId: integer("run_id").notNull(),
    time: timestamp("time").notNull(),
    nav: numeric("nav").notNull(),
    drawdown: numeric("drawdown"),
    benchmarkNav: numeric("benchmark_nav"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.time] }),
  }),
);

export const equityCurveRelations = relations(equityCurve, ({ one }) => ({
  backtestRun: one(backtestRun, {
    fields: [equityCurve.runId],
    references: [backtestRun.id],
  }),
}));
