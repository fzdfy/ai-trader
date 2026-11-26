import {
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const GROWTH_DEFENSE_INDEX_SYMBOLS = ["399673.SZ", "930955.CSI"] as const;

export const MAIN_INDEX_SYMBOLS = [
  "000001.SH",
  "000300.SH",
  "000905.SH",
  "000852.SH",
  "399673.SZ",
  "000688.SH",
  "930955.CSI",
] as const;

export const ROTATION_INDEX_SYMBOLS = MAIN_INDEX_SYMBOLS;
export type RotationIndexSymbol = (typeof ROTATION_INDEX_SYMBOLS)[number];
export type GrowthDefenseIndexSymbol = (typeof GROWTH_DEFENSE_INDEX_SYMBOLS)[number];

export const rotationIndexDailyBar = pgTable(
  "rotation_index_daily_bar",
  {
    symbol: text("symbol").notNull(),
    tradeDate: date("trade_date").notNull(),
    open: numeric("open", { precision: 20, scale: 6 }).notNull(),
    high: numeric("high", { precision: 20, scale: 6 }).notNull(),
    low: numeric("low", { precision: 20, scale: 6 }).notNull(),
    close: numeric("close", { precision: 20, scale: 6 }).notNull(),
    volume: numeric("volume", { precision: 24, scale: 4 }),
    amount: numeric("amount", { precision: 24, scale: 4 }),
    source: text("source").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.symbol, table.tradeDate] }),
    index("rotation_index_daily_symbol_date_idx").on(
      table.symbol,
      table.tradeDate.desc(),
    ),
  ],
);
