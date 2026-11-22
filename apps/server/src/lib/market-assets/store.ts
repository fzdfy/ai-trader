import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  marketAssetDailyBar,
  marketAssetMinuteBar,
  marketAssetQuote,
} from "../../db/schema";
import { quant, type MarketAssetBar, type MarketAssetQuote } from "../quant";
import {
  resolveMarketAsset,
  type MarketAssetSession,
} from "./catalog";

export interface MarketAssetQuoteValue extends Omit<MarketAssetQuote, "quoted_at"> {
  quotedAt: Date;
  quality: "available" | "low" | "missing";
  staleReason?: string | null;
  fallbackReason?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface MarketAssetBarValue extends Omit<MarketAssetBar, "session_date" | "bucket_start"> {
  sessionDate: string;
  bucketStart: string;
}

export interface StoredMarketAssetQuote extends MarketAssetQuoteValue {
  observedAt: Date;
}

export interface StoredMarketAssetBar {
  symbol: string;
  sessionDate: string;
  bucketStart: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
  source: string;
  observedAt: Date;
}

const decimal = (value: number | null) => (value == null ? null : String(value));

const SESSION_TIMEZONE: Record<MarketAssetSession, string> = {
  a_share: "Asia/Shanghai",
  global_gold: "Asia/Shanghai",
  us_equity: "America/New_York",
};

export function marketAssetDateKey(date: Date, session: MarketAssetSession): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SESSION_TIMEZONE[session],
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function dedupeMarketAssetBars<T extends { symbol: string; bucketStart: string }>(
  values: T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const value of values) {
    byKey.set(`${value.symbol}|${new Date(value.bucketStart).toISOString()}`, value);
  }
  return [...byKey.values()];
}

export async function ingestMarketAssetSymbols<T extends { symbol: string; bucketStart: string }>(
  symbols: string[],
  fetchOne: (symbol: string) => Promise<T[]>,
  upsert: (values: T[]) => Promise<number>,
): Promise<{
  upserted: number;
  succeeded: string[];
  failed: Array<{ symbol: string; error: string }>;
  skipped: number;
}> {
  const succeeded: string[] = [];
  const failed: Array<{ symbol: string; error: string }> = [];
  let skipped = 0;
  let upserted = 0;
  for (const symbol of symbols) {
    try {
      const values = dedupeMarketAssetBars(await fetchOne(symbol));
      if (values.length === 0) {
        skipped += 1;
        continue;
      }
      upserted += await upsert(values);
      succeeded.push(symbol);
    } catch (error) {
      failed.push({
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (succeeded.length === 0 && skipped === 0 && failed.length > 0) {
    throw new Error(
      `all market assets failed: ${failed.map((item) => `${item.symbol}: ${item.error}`).join("; ")}`,
    );
  }
  return { upserted, succeeded, failed, skipped };
}

export async function upsertMarketAssetQuotes(values: MarketAssetQuoteValue[]): Promise<number> {
  if (values.length === 0) return 0;
  const deduped = [...new Map(values.map((value) => [value.symbol, value])).values()];
  await db
    .insert(marketAssetQuote)
    .values(
      deduped.map((value) => ({
        symbol: value.symbol,
        price: String(value.price),
        preClose: decimal(value.pre_close),
        open: decimal(value.open),
        high: decimal(value.high),
        low: decimal(value.low),
        changePct: decimal(value.change_pct),
        volume: decimal(value.volume),
        amount: decimal(value.amount),
        quotedAt: value.quotedAt,
        source: value.source,
        quality: value.quality,
        staleReason: value.staleReason ?? null,
        fallbackReason: value.fallbackReason ?? null,
        raw: value.raw ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: marketAssetQuote.symbol,
      set: {
        price: sql.raw("excluded.price"),
        preClose: sql.raw("excluded.pre_close"),
        open: sql.raw("excluded.open"),
        high: sql.raw("excluded.high"),
        low: sql.raw("excluded.low"),
        changePct: sql.raw("excluded.change_pct"),
        volume: sql.raw("excluded.volume"),
        amount: sql.raw("excluded.amount"),
        quotedAt: sql.raw("excluded.quoted_at"),
        observedAt: new Date(),
        source: sql.raw("excluded.source"),
        quality: sql.raw("excluded.quality"),
        staleReason: sql.raw("excluded.stale_reason"),
        fallbackReason: sql.raw("excluded.fallback_reason"),
        raw: sql.raw("excluded.raw"),
      },
    });
  return deduped.length;
}

export async function upsertMarketAssetMinuteBars(
  values: MarketAssetBarValue[],
): Promise<number> {
  if (values.length === 0) return 0;
  const deduped = dedupeMarketAssetBars(values);
  await db
    .insert(marketAssetMinuteBar)
    .values(
      deduped.map((value) => ({
        symbol: value.symbol,
        sessionDate: value.sessionDate,
        bucketStart: new Date(value.bucketStart),
        open: String(value.open),
        high: String(value.high),
        low: String(value.low),
        close: String(value.close),
        volume: decimal(value.volume),
        amount: decimal(value.amount),
        source: value.source,
      })),
    )
    .onConflictDoUpdate({
      target: [marketAssetMinuteBar.symbol, marketAssetMinuteBar.bucketStart],
      set: {
        sessionDate: sql.raw("excluded.session_date"),
        open: sql.raw("excluded.open"),
        high: sql.raw("excluded.high"),
        low: sql.raw("excluded.low"),
        close: sql.raw("excluded.close"),
        volume: sql.raw("excluded.volume"),
        amount: sql.raw("excluded.amount"),
        source: sql.raw("excluded.source"),
        observedAt: new Date(),
      },
    });
  return deduped.length;
}

export async function upsertMarketAssetDailyBars(
  values: MarketAssetBarValue[],
): Promise<number> {
  if (values.length === 0) return 0;
  const deduped = [...new Map(values.map((value) => [`${value.symbol}|${value.sessionDate}`, value])).values()];
  await db
    .insert(marketAssetDailyBar)
    .values(
      deduped.map((value) => ({
        symbol: value.symbol,
        tradeDate: value.sessionDate,
        open: String(value.open),
        high: String(value.high),
        low: String(value.low),
        close: String(value.close),
        volume: decimal(value.volume),
        amount: decimal(value.amount),
        source: value.source,
      })),
    )
    .onConflictDoUpdate({
      target: [marketAssetDailyBar.symbol, marketAssetDailyBar.tradeDate],
      set: {
        open: sql.raw("excluded.open"),
        high: sql.raw("excluded.high"),
        low: sql.raw("excluded.low"),
        close: sql.raw("excluded.close"),
        volume: sql.raw("excluded.volume"),
        amount: sql.raw("excluded.amount"),
        source: sql.raw("excluded.source"),
        observedAt: new Date(),
      },
    });
  return deduped.length;
}

export async function readStoredMarketAssetQuote(
  symbol: string,
): Promise<StoredMarketAssetQuote | null> {
  const [row] = await db
    .select()
    .from(marketAssetQuote)
    .where(eq(marketAssetQuote.symbol, symbol))
    .limit(1);
  if (!row) return null;
  return {
    symbol: row.symbol,
    price: Number(row.price),
    pre_close: row.preClose == null ? null : Number(row.preClose),
    open: row.open == null ? null : Number(row.open),
    high: row.high == null ? null : Number(row.high),
    low: row.low == null ? null : Number(row.low),
    change_pct: row.changePct == null ? null : Number(row.changePct),
    volume: row.volume == null ? null : Number(row.volume),
    amount: row.amount == null ? null : Number(row.amount),
    quotedAt: row.quotedAt,
    observedAt: row.observedAt,
    source: row.source,
    price_unit: "",
    quality: row.quality as StoredMarketAssetQuote["quality"],
    staleReason: row.staleReason,
    fallbackReason: row.fallbackReason,
    raw: (row.raw as Record<string, unknown> | null) ?? null,
  };
}

export async function readStoredMarketAssetBars(
  symbol: string,
  kind: "minute" | "daily",
  options: { start?: Date; end?: Date; limit?: number } = {},
): Promise<StoredMarketAssetBar[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 1000, 5000));
  const definition = resolveMarketAsset(symbol);
  if (kind === "minute") {
    let query = db
      .select()
      .from(marketAssetMinuteBar)
      .where(
        and(
          eq(marketAssetMinuteBar.symbol, symbol),
          options.start ? gte(marketAssetMinuteBar.bucketStart, options.start) : undefined,
          options.end ? lte(marketAssetMinuteBar.bucketStart, options.end) : undefined,
        ),
      )
      .$dynamic();
    const rows = await query.orderBy(desc(marketAssetMinuteBar.bucketStart)).limit(limit);
    return [...rows].reverse().map((row) => ({
      symbol: row.symbol,
      sessionDate: row.sessionDate,
      bucketStart: row.bucketStart,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.volume == null ? null : Number(row.volume),
      amount: row.amount == null ? null : Number(row.amount),
      source: row.source,
      observedAt: row.observedAt,
    }));
  }
  const startDate = options.start
    ? marketAssetDateKey(options.start, definition.session)
    : undefined;
  const endDate = options.end
    ? marketAssetDateKey(options.end, definition.session)
    : undefined;
  let query = db
    .select()
    .from(marketAssetDailyBar)
    .where(
      and(
        eq(marketAssetDailyBar.symbol, symbol),
        startDate ? gte(marketAssetDailyBar.tradeDate, startDate) : undefined,
        endDate ? lte(marketAssetDailyBar.tradeDate, endDate) : undefined,
      ),
    )
    .$dynamic();
  const rows = await query.orderBy(desc(marketAssetDailyBar.tradeDate)).limit(limit);
  return [...rows].reverse().map((row) => ({
    symbol: row.symbol,
    sessionDate: row.tradeDate,
    bucketStart: new Date(`${row.tradeDate}T00:00:00+08:00`),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? null : Number(row.volume),
    amount: row.amount == null ? null : Number(row.amount),
    source: row.source,
    observedAt: row.observedAt,
  }));
}

export async function fetchAndStoreMarketAssetQuotes(symbols: string[]) {
  const quotes = await quant.marketAssetQuotes(symbols);
  const values: MarketAssetQuoteValue[] = Object.values(quotes).map((quote) => ({
    ...quote,
    quotedAt: new Date(quote.quoted_at),
    quality: "available" as const,
  }));
  return upsertMarketAssetQuotes(values);
}
