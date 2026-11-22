import {
  MARKET_ASSET_SYMBOLS,
  resolveMarketAsset,
} from "../market-assets/catalog";
import {
  marketAssetReader,
  type MarketAssetBarRead,
  type MarketAssetQuoteRead,
} from "../market-assets/reader";
import { loadDashboardSnapshot } from "./dashboard-snapshot";
import { toMarketChart, type MarketChartResponse } from "./market-chart";
import { computeMarketSignal, type MarketSignal } from "./market-signal";
import { resolveMarketRange, type MarketRange } from "./market-range";

export interface MarketBriefQuery {
  symbol: "000001.SH" | "399006.SZ";
  range: MarketRange;
  etfSymbol: "510300.SH" | "588000.SH" | "159992.SZ";
  etfRange: MarketRange;
  globalSymbol: "XAUUSD" | "IXIC";
  globalRange: MarketRange;
}

export interface AShareSession {
  phase:
    | "pre_open"
    | "morning_open"
    | "midday_break"
    | "afternoon_open"
    | "closed"
    | "non_trading_day";
  label: string;
  tradeDate: string | null;
  nextEventLabel: string | null;
  nextEventAt: string | null;
}

export interface MarketTick {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  priceUnit: string;
  asOf: string | null;
  quality: "available" | "low" | "missing";
  source: string;
  staleReason: string | null;
}

export interface MarketBriefResponse {
  asOf: string | null;
  aShareSession: AShareSession;
  tickers: MarketTick[];
  aShareChart: MarketChartResponse;
  etfChart: MarketChartResponse;
  globalChart: MarketChartResponse;
  signal: MarketSignal;
}

export interface MarketBriefDependencies {
  now: () => Date;
  readQuote: (symbol: string) => Promise<MarketAssetQuoteRead>;
  readBars: (
    symbol: string,
    options: {
      kind: "minute" | "daily";
      start: Date;
      end: Date;
      limit: number;
      latestSessionOnly?: boolean;
    },
  ) => Promise<MarketAssetBarRead>;
  loadSnapshot: () => Promise<{
    breadth: {
      industry: { total: number; rising: number };
    };
    fundFlow: {
      breadth: {
        industry: { total: number; positive: number };
      };
    };
    limitUp: { total: number; maxBoard: number; avgTurnover: number };
  }>;
}

const defaultDependencies: MarketBriefDependencies = {
  now: () => new Date(),
  readQuote: (symbol) => marketAssetReader.readQuote(symbol),
  readBars: (symbol, options) => marketAssetReader.readBars(symbol, options),
  loadSnapshot: loadDashboardSnapshot,
};

function localDate(now: Date): { year: number; month: number; day: number; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

export function resolveAShareSession(now: Date): AShareSession {
  const local = localDate(now);
  const tradeDate = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  if (local.weekday === 0 || local.weekday === 6) {
    return {
      phase: "non_trading_day",
      label: "非交易日",
      tradeDate,
      nextEventLabel: null,
      nextEventAt: null,
    };
  }
  if (local.minutes < 570) {
    return { phase: "pre_open", label: "盘前", tradeDate, nextEventLabel: "开盘", nextEventAt: "09:30" };
  }
  if (local.minutes <= 690) {
    return { phase: "morning_open", label: "上午交易", tradeDate, nextEventLabel: "午休", nextEventAt: "11:30" };
  }
  if (local.minutes < 780) {
    return { phase: "midday_break", label: "午休", tradeDate, nextEventLabel: "下午开盘", nextEventAt: "13:00" };
  }
  if (local.minutes <= 900) {
    return { phase: "afternoon_open", label: "下午交易", tradeDate, nextEventLabel: "收盘", nextEventAt: "15:00" };
  }
  return { phase: "closed", label: "已收盘", tradeDate, nextEventLabel: null, nextEventAt: null };
}

function missingQuote(symbol: string): MarketAssetQuoteRead {
  const definition = resolveMarketAsset(symbol);
  return {
    symbol: definition.symbol,
    name: definition.name,
    price: null,
    preClose: null,
    open: null,
    high: null,
    low: null,
    changePct: null,
    volume: null,
    amount: null,
    priceUnit: definition.priceUnit,
    asOf: null,
    source: "none",
    quality: "missing",
    staleReason: "no valid snapshot",
  };
}

function missingChart(symbol: string, range: MarketRange): MarketChartResponse {
  const definition = resolveMarketAsset(symbol);
  return {
    symbol: definition.symbol,
    name: definition.name,
    range,
    timezone: "Asia/Shanghai",
    sessionDate: null,
    hasVolume: definition.hasVolume,
    points: [],
    quality: "missing",
    staleReason: "no valid bars",
  };
}

async function safeQuote(
  symbol: string,
  dependencies: MarketBriefDependencies,
): Promise<MarketAssetQuoteRead> {
  try {
    return await dependencies.readQuote(symbol);
  } catch {
    return missingQuote(symbol);
  }
}

async function safeChart(
  symbol: string,
  range: MarketRange,
  now: Date,
  dependencies: MarketBriefDependencies,
): Promise<MarketChartResponse> {
  const definition = resolveMarketAsset(symbol);
  const resolved = resolveMarketRange(range, now, definition.session);
  const isMinute = resolved.granularity === "minute";
  try {
    const read = await dependencies.readBars(symbol, {
      kind: resolved.granularity,
      start: isMinute ? new Date(now.getTime() - 7 * 24 * 60 * 60_000) : resolved.start,
      end: resolved.end,
      limit: isMinute ? 2000 : 1000,
      latestSessionOnly: isMinute,
    });
    return toMarketChart(read, definition, range);
  } catch {
    return missingChart(symbol, range);
  }
}

async function safeSnapshot(
  dependencies: MarketBriefDependencies,
): Promise<
  | {
      breadth: { industry: { total: number; rising: number } };
      fundFlow: { breadth: { industry: { total: number; positive: number } } };
      limitUp: { total: number; maxBoard: number; avgTurnover: number };
    }
  | null
> {
  try {
    return await dependencies.loadSnapshot();
  } catch {
    return null;
  }
}

function toTick(read: MarketAssetQuoteRead): MarketTick {
  return {
    symbol: read.symbol,
    name: read.name,
    price: read.price,
    changePct: read.changePct,
    priceUnit: read.priceUnit,
    asOf: read.asOf,
    quality: read.quality,
    source: read.source,
    staleReason: read.staleReason,
  };
}

export async function loadMarketBrief(
  query: MarketBriefQuery,
  dependencies: MarketBriefDependencies = defaultDependencies,
): Promise<MarketBriefResponse> {
  const now = dependencies.now();
  const [quotes, aShareChart, etfChart, globalChart, snapshot] = await Promise.all([
    Promise.all(MARKET_ASSET_SYMBOLS.map((symbol) => safeQuote(symbol, dependencies))),
    safeChart(query.symbol, query.range, now, dependencies),
    safeChart(query.etfSymbol, query.etfRange, now, dependencies),
    safeChart(query.globalSymbol, query.globalRange, now, dependencies),
    safeSnapshot(dependencies),
  ]);
  const selected = quotes.find((item) => item.symbol === query.symbol) ?? missingQuote(query.symbol);
  const points = aShareChart.points;
  const closes = points.map((point) => point.price);
  const ma20 =
    closes.length >= 20
      ? closes.slice(-20).reduce((sum, value) => sum + value, 0) / 20
      : null;
  const close20Ago = closes.length >= 21 ? closes[closes.length - 21]! : null;
  const industry = snapshot?.breadth.industry;
  const fundBreadth = snapshot?.fundFlow.breadth.industry;
  const signal = computeMarketSignal({
    aShare: {
      price: selected.price ?? points.at(-1)?.price ?? null,
      ma20,
      close20Ago,
      changePct: selected.changePct,
    },
    breadth: {
      risingIndustryRatio:
        industry && industry.total > 0 ? industry.rising / industry.total : null,
      positiveFundFlowRatio:
        fundBreadth && fundBreadth.total > 0 ? fundBreadth.positive / fundBreadth.total : null,
    },
    heat: {
      limitUpTotal: snapshot?.limitUp.total ?? null,
      maxBoard: snapshot?.limitUp.maxBoard ?? null,
      avgTurnover: snapshot?.limitUp.avgTurnover ?? null,
    },
    asOf: selected.asOf,
  });
  return {
    asOf: selected.asOf,
    aShareSession: resolveAShareSession(now),
    tickers: quotes.map(toTick),
    aShareChart,
    etfChart,
    globalChart,
    signal,
  };
}
