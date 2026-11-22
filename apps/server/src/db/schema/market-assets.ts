import {
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const marketAssetQuote = pgTable(
  "market_asset_quote",
  {
    symbol: text("symbol").notNull(),
    price: numeric("price", { precision: 20, scale: 6 }).notNull(),
    preClose: numeric("pre_close", { precision: 20, scale: 6 }),
    open: numeric("open", { precision: 20, scale: 6 }),
    high: numeric("high", { precision: 20, scale: 6 }),
    low: numeric("low", { precision: 20, scale: 6 }),
    changePct: numeric("change_pct", { precision: 12, scale: 6 }),
    volume: numeric("volume", { precision: 24, scale: 4 }),
    amount: numeric("amount", { precision: 24, scale: 4 }),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull(),
    quality: text("quality").notNull(),
    staleReason: text("stale_reason"),
    fallbackReason: text("fallback_reason"),
    raw: jsonb("raw"),
  },
  (table) => [primaryKey({ columns: [table.symbol] })],
);

export const marketAssetMinuteBar = pgTable(
  "market_asset_minute_bar",
  {
    symbol: text("symbol").notNull(),
    sessionDate: date("session_date").notNull(),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
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
    primaryKey({ columns: [table.symbol, table.bucketStart] }),
    index("market_asset_minute_symbol_bucket_idx").on(table.symbol, table.bucketStart.desc()),
    index("market_asset_minute_session_idx").on(table.sessionDate),
  ],
);

export const marketAssetDailyBar = pgTable(
  "market_asset_daily_bar",
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
    index("market_asset_daily_symbol_date_idx").on(table.symbol, table.tradeDate.desc()),
  ],
);
