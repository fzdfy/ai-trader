import type { RotationSeries } from "../market-rotation/compute";

const ASSET_NAMES: Record<string, string> = {
  "510300.SH": "沪深300ETF",
  "588000.SH": "科创50ETF",
  XAUUSD: "伦敦金",
  IXIC: "纳斯达克综合指数",
};

interface AssetBars {
  symbol: string;
  bars: Array<{ sessionDate: string; close: number }>;
}

export function buildAssetRotationSeries(inputs: AssetBars[]): {
  series: RotationSeries[];
  errors: Array<{ section: string; message: string }>;
} {
  const series: RotationSeries[] = [];
  const errors: Array<{ section: string; message: string }> = [];
  for (const input of inputs) {
    if (input.bars.length < 2) {
      errors.push({ section: input.symbol, message: "同期日线不足 2 个交易日" });
      continue;
    }
    series.push({
      code: input.symbol,
      name: ASSET_NAMES[input.symbol] ?? input.symbol,
      points: input.bars.map((bar) => ({ date: bar.sessionDate, value: bar.close })),
    });
  }
  return { series, errors };
}
