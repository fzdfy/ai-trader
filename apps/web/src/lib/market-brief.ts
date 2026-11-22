export type MarketAssetSymbol =
  | "000001.SH"
  | "399006.SZ"
  | "510300.SH"
  | "588000.SH"
  | "159992.SZ"
  | "XAUUSD"
  | "IXIC";
export type MarketRange = "1D" | "5D" | "1M" | "YTD";
export type MarketQuality = "available" | "low" | "missing";

export interface MarketChartPoint {
  time: string;
  price: number;
  volume: number | null;
  open: number;
  high: number;
  low: number;
}

export interface MarketChart {
  symbol: string;
  name: string;
  range: MarketRange;
  timezone: "Asia/Shanghai";
  sessionDate: string | null;
  hasVolume: boolean;
  points: MarketChartPoint[];
  quality: MarketQuality;
  staleReason: string | null;
}

export interface MarketTick {
  symbol: string;
  name: string;
  price: number | null;
  preClose: number | null;
  changePct: number | null;
  priceUnit: string;
  asOf: string | null;
  quality: MarketQuality;
  source: string;
  staleReason: string | null;
}

export interface MarketSignal {
  stance: "risk_on" | "neutral" | "risk_off";
  headline: string;
  body: string;
  dataConfidence: number;
  factors: Array<{
    key: "trend" | "breadth" | "heat";
    label: string;
    score: number | null;
    evidence: string;
  }>;
  modelVersion: "dashboard-signal-v1";
  asOf: string | null;
  quality: MarketQuality;
}

export interface MarketBriefResponse {
  asOf: string | null;
  aShareSession: {
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
  };
  tickers: MarketTick[];
  aShareChart: MarketChart;
  etfChart: MarketChart;
  globalChart: MarketChart;
  signal: MarketSignal;
}

export interface MarketBriefQueryParams {
  symbol: "000001.SH" | "399006.SZ";
  range: MarketRange;
  etfSymbol: "510300.SH" | "588000.SH" | "159992.SZ";
  etfRange: MarketRange;
  globalSymbol: "XAUUSD" | "IXIC";
  globalRange: MarketRange;
}

export interface SystemFeatures {
  dashboardMarketRadar: boolean;
}

export const A_SHARE_INDEX_SYMBOLS = ["000001.SH", "399006.SZ"] as const;
export type AShareIndexSymbol = (typeof A_SHARE_INDEX_SYMBOLS)[number];

const A_SHARE_INDEX_LABELS: Record<AShareIndexSymbol, string> = {
  "000001.SH": "上证指数",
  "399006.SZ": "创业板指",
};

export interface AShareIndexOverviewItem {
  symbol: AShareIndexSymbol;
  label: string;
  ticker: MarketTick | null;
}

export function buildAShareIndexOverview(
  tickers: readonly MarketTick[],
): AShareIndexOverviewItem[] {
  const bySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
  return A_SHARE_INDEX_SYMBOLS.map((symbol) => ({
    symbol,
    label: A_SHARE_INDEX_LABELS[symbol],
    ticker: bySymbol.get(symbol) ?? null,
  }));
}

export function nextMarketTab<T extends string>(
  symbols: readonly T[],
  current: T,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
): T {
  if (key === "Home") return symbols[0]!;
  if (key === "End") return symbols.at(-1)!;
  const index = Math.max(0, symbols.indexOf(current));
  const direction = key === "ArrowRight" ? 1 : -1;
  return symbols[(index + direction + symbols.length) % symbols.length]!;
}

export function moveChartPoint(
  length: number,
  current: number,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
): number {
  if (length <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  const index = Math.max(0, Math.min(current, length - 1));
  const direction = key === "ArrowRight" ? 1 : -1;
  return Math.max(0, Math.min(index + direction, length - 1));
}

export function formatMarketPrice(value: number | null, unit: string): string {
  const formatted = formatMarketNumber(value);
  return formatted === "—" ? formatted : `${formatted} ${unit}`;
}

export function formatMarketNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatChangePct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatChartAxisValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

export function formatMarketChartAxisLabel(value: string, range: MarketRange): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5, 16);
  if (range === "1D") {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }
  if (range === "YTD") {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatFactorScore(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "缺失";
  const rounded = Math.round(value);
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function formatMarketBriefDate(asOf: string | null): { weekday: string; date: string } {
  if (!asOf) return { weekday: "MARKET", date: "NO SNAPSHOT" };
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) {
    return { weekday: "MARKET", date: "NO SNAPSHOT" };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: value("weekday").toUpperCase(),
    date: `${value("month")}.${value("day")}`,
  };
}

export function marketQualityLabel(quality: MarketQuality, staleReason: string | null): string {
  if (quality === "missing") return "暂不可用";
  if (quality === "low") return staleReason ? "数据陈旧" : "低质量";
  return "可用";
}

export function canRenderMarketChart(chart: {
  points: Array<{ time: string; price: number }>;
}): boolean {
  return chart.points.length >= 2;
}

export function shouldLoadMarketRadar(features: Partial<SystemFeatures> | undefined): boolean {
  return features?.dashboardMarketRadar === true;
}

export function orderTodayWorkTasks<T extends { dueTime: string | null; sortOrder: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    if (left.dueTime && right.dueTime && left.dueTime !== right.dueTime) {
      return left.dueTime.localeCompare(right.dueTime);
    }
    if (left.dueTime && !right.dueTime) return -1;
    if (!left.dueTime && right.dueTime) return 1;
    return left.sortOrder - right.sortOrder;
  });
}

export function latestThreeWorkflowRuns<T extends { createdAt: string }>(items: readonly T[]): T[] {
  return [...items]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3);
}
