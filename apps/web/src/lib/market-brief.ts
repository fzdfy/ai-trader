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
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${unit}`;
}

export function formatChangePct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function marketQualityLabel(
  quality: MarketQuality,
  staleReason: string | null,
): string {
  if (quality === "missing") return "暂不可用";
  if (quality === "low") return staleReason ? "数据陈旧" : "低质量";
  return "可用";
}

export function canRenderMarketChart(chart: { points: Array<{ time: string; price: number }> }): boolean {
  return chart.points.length >= 2;
}

export function shouldLoadMarketRadar(features: Partial<SystemFeatures> | undefined): boolean {
  return features?.dashboardMarketRadar === true;
}

export function orderTodayWorkTasks<
  T extends { dueTime: string | null; sortOrder: number },
>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.dueTime && right.dueTime && left.dueTime !== right.dueTime) {
      return left.dueTime.localeCompare(right.dueTime);
    }
    if (left.dueTime && !right.dueTime) return -1;
    if (!left.dueTime && right.dueTime) return 1;
    return left.sortOrder - right.sortOrder;
  });
}

export function latestThreeWorkflowRuns<T extends { createdAt: string }>(
  items: readonly T[],
): T[] {
  return [...items]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 3);
}
