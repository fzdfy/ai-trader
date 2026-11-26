import type { KLineData } from "klinecharts";

export const KLINE_MA_PERIODS = [5, 10, 20, 30, 60, 120, 250] as const;
export type KlineMaPeriod = (typeof KLINE_MA_PERIODS)[number];

export interface LatestKlineSummary {
  bar: KLineData;
  ma: Record<KlineMaPeriod, number | null>;
}

export function summarizeKlineAt(
  bars: KLineData[],
  index: number,
): LatestKlineSummary | null {
  const normalizedIndex = Math.trunc(index);
  const bar = bars[normalizedIndex];
  if (!bar) return null;

  const closes = bars.slice(0, normalizedIndex + 1).map((item) => item.close);
  const ma = Object.fromEntries(
    KLINE_MA_PERIODS.map((period) => {
      if (closes.length < period) return [period, null];
      const window = closes.slice(-period);
      return [period, window.reduce((sum, close) => sum + close, 0) / period];
    }),
  ) as Record<KlineMaPeriod, number | null>;

  return { bar, ma };
}

export function summarizeLatestKline(bars: KLineData[]): LatestKlineSummary | null {
  return bars.length > 0 ? summarizeKlineAt(bars, bars.length - 1) : null;
}
