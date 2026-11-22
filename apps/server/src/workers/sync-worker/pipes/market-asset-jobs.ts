import { isTradeDay } from "../calendar";
import {
  MARKET_ASSET_SYMBOLS,
  MARKET_ASSETS,
  type MarketAssetSymbol,
} from "../../../lib/market-assets/catalog";
import {
  upsertMarketAssetDailyBars,
  upsertMarketAssetMinuteBars,
  upsertMarketAssetQuotes,
  type MarketAssetBarValue,
} from "../../../lib/market-assets/store";
import { quant, type MarketAssetBar, type MarketAssetQuote } from "../../../lib/quant";

export interface MarketAssetJobFailure {
  symbol: string;
  error: string;
}

export interface MarketAssetJobResult {
  quotesUpserted: number;
  barsUpserted: number;
  succeeded: string[];
  failed: MarketAssetJobFailure[];
}

export interface MarketAssetJobDependencies {
  now: () => Date;
  isTradingDay: (now: Date) => Promise<boolean>;
  fetchQuotes: (symbols: MarketAssetSymbol[]) => Promise<Record<string, MarketAssetQuote>>;
  fetchMinute: (
    symbol: MarketAssetSymbol,
    tf: "1m" | "5m",
  ) => Promise<MarketAssetBar[]>;
  fetchDaily: (symbol: MarketAssetSymbol) => Promise<MarketAssetBar[]>;
  upsertQuotes: typeof upsertMarketAssetQuotes;
  upsertMinute: typeof upsertMarketAssetMinuteBars;
  upsertDaily: typeof upsertMarketAssetDailyBars;
}

function shanghaiClock(now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return { weekday, minutes: hour * 60 + minute };
}

function newYorkClock(now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return { weekday, minutes: hour * 60 + minute };
}

export function isAShareClockOpen(now: Date): boolean {
  const { weekday, minutes } = shanghaiClock(now);
  if (weekday === 0 || weekday === 6) return false;
  return (minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes <= 900);
}

export function isUSClockOpen(now: Date): boolean {
  const { weekday, minutes } = newYorkClock(now);
  if (weekday === 0 || weekday === 6) return false;
  return minutes >= 570 && minutes < 960;
}

function toBarValue(bar: MarketAssetBar): MarketAssetBarValue {
  return {
    symbol: bar.symbol,
    sessionDate: bar.session_date,
    bucketStart: bar.bucket_start,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    amount: bar.amount,
    source: bar.source,
  };
}

function toQuoteValue(quote: MarketAssetQuote) {
  return {
    ...quote,
    quotedAt: new Date(quote.quoted_at),
    quality: "available" as const,
  };
}

async function fetchQuotes(
  deps: MarketAssetJobDependencies,
  failures: MarketAssetJobFailure[],
): Promise<number> {
  try {
    const quotes = await deps.fetchQuotes([...MARKET_ASSET_SYMBOLS]);
    return await deps.upsertQuotes(Object.values(quotes).map(toQuoteValue));
  } catch (error) {
    failures.push({
      symbol: "quotes:*",
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

async function fetchBars(
  symbols: MarketAssetSymbol[],
  fetchOne: (symbol: MarketAssetSymbol) => Promise<MarketAssetBar[]>,
  upsert: (values: MarketAssetBarValue[]) => Promise<number>,
  failures: MarketAssetJobFailure[],
) {
  let barsUpserted = 0;
  const succeeded: string[] = [];
  for (const symbol of symbols) {
    try {
      const values = (await fetchOne(symbol)).map(toBarValue);
      if (values.length === 0) {
        failures.push({ symbol, error: "empty result" });
        continue;
      }
      barsUpserted += await upsert(values);
      succeeded.push(symbol);
    } catch (error) {
      failures.push({
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { barsUpserted, succeeded };
}

export async function runMarketAssetMinuteJob(
  deps: MarketAssetJobDependencies,
): Promise<MarketAssetJobResult> {
  const now = deps.now();
  const failures: MarketAssetJobFailure[] = [];
  const aShareOpen =
    isAShareClockOpen(now) && (await deps.isTradingDay(now));
  const active = MARKET_ASSET_SYMBOLS.filter((symbol) => {
    const session = MARKET_ASSETS[symbol].session;
    if (session === "a_share") return aShareOpen;
    if (session === "us_equity") return isUSClockOpen(now);
    return true;
  });
  const quotesUpserted = await fetchQuotes(deps, failures);
  const bars = await fetchBars(
    active,
    (symbol) =>
      deps.fetchMinute(symbol, MARKET_ASSETS[symbol].session === "us_equity" ? "5m" : "1m"),
    deps.upsertMinute,
    failures,
  );
  if (quotesUpserted === 0 && bars.barsUpserted === 0) {
    throw new Error(
      `all market asset minute work failed: ${failures.map((item) => `${item.symbol}: ${item.error}`).join("; ")}`,
    );
  }
  return {
    quotesUpserted,
    barsUpserted: bars.barsUpserted,
    succeeded: bars.succeeded,
    failed: failures,
  };
}

export async function runMarketAssetDailyJob(
  deps: MarketAssetJobDependencies,
): Promise<MarketAssetJobResult> {
  const failures: MarketAssetJobFailure[] = [];
  const quotesUpserted = await fetchQuotes(deps, failures);
  const bars = await fetchBars(
    [...MARKET_ASSET_SYMBOLS],
    deps.fetchDaily,
    deps.upsertDaily,
    failures,
  );
  if (quotesUpserted === 0 && bars.barsUpserted === 0) {
    throw new Error(
      `all market asset daily work failed: ${failures.map((item) => `${item.symbol}: ${item.error}`).join("; ")}`,
    );
  }
  return {
    quotesUpserted,
    barsUpserted: bars.barsUpserted,
    succeeded: bars.succeeded,
    failed: failures,
  };
}

export const defaultMarketAssetJobDependencies: MarketAssetJobDependencies = {
  now: () => new Date(),
  isTradingDay: async (now) => isTradeDay(now),
  fetchQuotes: (symbols) => quant.marketAssetQuotes(symbols),
  fetchMinute: (symbol, tf) =>
    quant.marketAssetMinute(symbol, tf, symbol === "XAUUSD" ? 2000 : 500),
  fetchDaily: (symbol) => quant.marketAssetDaily(symbol, 600),
  upsertQuotes: upsertMarketAssetQuotes,
  upsertMinute: upsertMarketAssetMinuteBars,
  upsertDaily: upsertMarketAssetDailyBars,
};

export const marketAssetMinuteJobRun = () =>
  runMarketAssetMinuteJob(defaultMarketAssetJobDependencies);

export const marketAssetDailyJobRun = () =>
  runMarketAssetDailyJob(defaultMarketAssetJobDependencies);

export const marketAssetDailyBackfillRun = marketAssetDailyJobRun;
