import type { MarketAssetDefinition } from "../market-assets/catalog";
import type { MarketAssetBarRead } from "../market-assets/reader";
import type { MarketRange } from "./market-range";

export interface MarketChartResponse {
  symbol: string;
  name: string;
  range: MarketRange;
  timezone: "Asia/Shanghai";
  sessionDate: string | null;
  hasVolume: boolean;
  points: Array<{
    time: string;
    price: number;
    volume: number | null;
    open: number;
    high: number;
    low: number;
  }>;
  quality: "available" | "low" | "missing";
  staleReason: string | null;
}

export function toMarketChart(
  read: MarketAssetBarRead,
  definition: MarketAssetDefinition,
  range: MarketRange,
): MarketChartResponse {
  return {
    symbol: definition.symbol,
    name: definition.name,
    range,
    timezone: "Asia/Shanghai",
    sessionDate: read.sessionDate,
    hasVolume: definition.hasVolume,
    points: [...read.points].sort((left, right) => left.time.localeCompare(right.time)),
    quality: read.quality,
    staleReason: read.staleReason,
  };
}
