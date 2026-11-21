import { createLogger } from "./logger";
import type { AnalysisBar } from "./stock-analysis-data";
import { quant, type StockQuote } from "./quant";
import { db } from "../db";
import { bar1dQfq, quoteLatest } from "../db/schema";
import { desc, eq } from "drizzle-orm";

export type { AnalysisBar } from "./stock-analysis-data";

export interface MarketQuote {
  symbol: string;
  name: string | null;
  last: number | null;
  volume: number | null;
  amount: number | null;
  change: number | null;
  changePct: number | null;
  pe: number | null;
  pb: number | null;
  turnoverRate: number | null;
  totalMarketCap: number | null;
  status: string | null;
}

export interface LiveMarketQuote extends MarketQuote {
  isStale?: boolean;
}

export interface StoredMarketQuote extends MarketQuote {
  asOf: Date;
}

export interface QuoteRead {
  quote: MarketQuote | null;
  asOf: string | null;
  source: "quant-live" | "quote_latest";
  quality: "available" | "low" | "missing";
  fallback: boolean;
}

export interface DailyBarsRead {
  bars: AnalysisBar[];
  asOf: string | null;
  source: "quant-live-qfq" | "bar1d_qfq";
  quality: "available" | "low" | "missing";
  fallback: boolean;
}

export interface MarketDataReaderDependencies {
  readLiveQuote(symbol: string): Promise<LiveMarketQuote | null>;
  readStoredQuote(symbol: string): Promise<StoredMarketQuote | null>;
  readLiveBars(symbol: string, limit: number): Promise<AnalysisBar[]>;
  readStoredBars(symbol: string, limit: number): Promise<AnalysisBar[]>;
  now?: () => Date;
}

const log = createLogger("market-data");
const STALE_AFTER_MS = 3 * 86_400_000;

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBarTime(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  return new Date(value).toISOString();
}

function toMarketQuote(value: StockQuote): LiveMarketQuote {
  const extra = value.extra ?? {};
  return {
    symbol: value.symbol,
    name: value.name,
    last: numberOrNull(value.last),
    volume: numberOrNull(value.volume),
    amount: numberOrNull(value.amount),
    change: numberOrNull(value.change),
    changePct: numberOrNull(value.change_pct),
    pe: numberOrNull(value.pe),
    pb: numberOrNull(value.pb),
    turnoverRate: numberOrNull(value.turnover_rate),
    totalMarketCap:
      numberOrNull(extra.totalMarketCap) ??
      numberOrNull(extra.total_market_cap) ??
      numberOrNull(extra.marketCap),
    status: value.is_stale ? "stale" : value.last == null ? "unavailable" : "trading",
    isStale: value.is_stale,
  };
}

function quoteQuality(asOf: Date, now: Date): "available" | "low" {
  return now.getTime() - asOf.getTime() <= STALE_AFTER_MS ? "available" : "low";
}

function barsQuality(bars: AnalysisBar[]): "available" | "low" | "missing" {
  if (bars.length === 0) return "missing";
  return bars.length >= 60 ? "available" : "low";
}

const defaultDependencies: MarketDataReaderDependencies = {
  async readLiveQuote(symbol) {
    const quotes = await quant.liveQuotes([symbol]);
    const value = quotes[symbol];
    if (!value || value.last == null) return null;
    return toMarketQuote(value);
  },

  async readStoredQuote(symbol) {
    const [row] = await db
      .select()
      .from(quoteLatest)
      .where(eq(quoteLatest.symbol, symbol))
      .limit(1);
    if (!row) return null;
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    return {
      symbol: row.symbol,
      name: row.name,
      last: numberOrNull(row.last),
      volume: numberOrNull(row.volume),
      amount: numberOrNull(row.amount),
      change: numberOrNull(row.change),
      changePct: numberOrNull(row.changePct),
      pe: numberOrNull(row.pe),
      pb: numberOrNull(row.pb),
      turnoverRate: numberOrNull(row.turnoverRate),
      totalMarketCap:
        numberOrNull(extra.totalMarketCap) ??
        numberOrNull(extra.total_market_cap) ??
        numberOrNull(extra.marketCap),
      status: row.status,
      asOf: row.ts,
    };
  },

  async readLiveBars(symbol, limit) {
    const rows = await quant.stockKline(symbol, limit, undefined, undefined, "qfq");
    return rows.map((bar) => ({
      time: normalizeBarTime(bar.time),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      amount: bar.amount,
    }));
  },

  async readStoredBars(symbol, limit) {
    const rows = await db
      .select()
      .from(bar1dQfq)
      .where(eq(bar1dQfq.symbol, symbol))
      .orderBy(desc(bar1dQfq.time))
      .limit(limit);
    return [...rows].reverse().map((bar) => ({
      time: bar.time.toISOString(),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume),
      amount: bar.amount == null ? null : Number(bar.amount),
    }));
  },
};

export function createMarketDataReader(dependencies: MarketDataReaderDependencies) {
  const now = dependencies.now ?? (() => new Date());

  return {
    async readQuote(symbol: string): Promise<QuoteRead> {
      let live: LiveMarketQuote | null = null;
      try {
        live = await dependencies.readLiveQuote(symbol);
        if (live?.last != null && !live.isStale) {
          return {
            quote: live,
            asOf: now().toISOString(),
            source: "quant-live",
            quality: "available",
            fallback: false,
          };
        }
      } catch (error) {
        log.warn({ err: error, symbol }, "实时行情失败，尝试数据库兜底");
      }

      try {
        const stored = await dependencies.readStoredQuote(symbol);
        if (stored) {
          return {
            quote: stored,
            asOf: stored.asOf.toISOString(),
            source: "quote_latest",
            quality: quoteQuality(stored.asOf, now()),
            fallback: true,
          };
        }
      } catch (error) {
        log.warn({ err: error, symbol }, "数据库行情兜底失败");
      }

      if (live?.last != null) {
        return {
          quote: live,
          asOf: now().toISOString(),
          source: "quant-live",
          quality: "low",
          fallback: false,
        };
      }
      return {
        quote: null,
        asOf: null,
        source: "quote_latest",
        quality: "missing",
        fallback: true,
      };
    },

    async readDailyBars(symbol: string, limit: number): Promise<DailyBarsRead> {
      try {
        const live = await dependencies.readLiveBars(symbol, limit);
        if (live.length > 0) {
          return {
            bars: live,
            asOf: live.at(-1)?.time ?? null,
            source: "quant-live-qfq",
            quality: barsQuality(live),
            fallback: false,
          };
        }
      } catch (error) {
        log.warn({ err: error, symbol }, "实时 K 线失败，尝试数据库兜底");
      }

      try {
        const stored = await dependencies.readStoredBars(symbol, limit);
        if (stored.length > 0) {
          return {
            bars: stored,
            asOf: stored.at(-1)?.time ?? null,
            source: "bar1d_qfq",
            quality: barsQuality(stored),
            fallback: true,
          };
        }
      } catch (error) {
        log.warn({ err: error, symbol }, "数据库 K 线兜底失败");
      }

      return {
        bars: [],
        asOf: null,
        source: "bar1d_qfq",
        quality: "missing",
        fallback: true,
      };
    },
  };
}

export const marketDataReader = createMarketDataReader(defaultDependencies);
