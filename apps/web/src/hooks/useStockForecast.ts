import { useQuery } from "@tanstack/react-query";
import type { AnalysisQuality, ScenarioForecast } from "./useStockAnalysis.ts";

export interface StockForecastResponse {
  symbol: string;
  asOf: string | null;
  source: string;
  quality: AnalysisQuality;
  forecasts: ScenarioForecast[];
}

async function fetchStockForecast(
  symbol: string,
  signal: AbortSignal,
): Promise<StockForecastResponse> {
  const response = await fetch(`/api/v1/stock-analysis/${encodeURIComponent(symbol)}/forecast`, {
    signal,
  });
  const payload = (await response.json()) as {
    success?: boolean;
    data?: StockForecastResponse;
    error?: string;
  };
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error ?? "未来走势预测读取失败");
  }
  return payload.data;
}

export function useStockForecastQuery(symbol: string) {
  return useQuery({
    queryKey: ["stock-forecast", symbol],
    queryFn: ({ signal }) => fetchStockForecast(symbol, signal),
    staleTime: 60_000,
    enabled: Boolean(symbol),
  });
}
