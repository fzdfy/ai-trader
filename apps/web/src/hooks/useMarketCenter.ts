import { useQuery } from "@tanstack/react-query";
import type {
  MarketCenterOverviewResponse,
  MarketRotationResponse,
  RotationScope,
  RotationWindow,
} from "../lib/market-center";

type ApiPayload<T> = { success: boolean; data?: T; error?: string };

async function getData<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const payload = (await response.json()) as ApiPayload<T>;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error ?? "行情中心数据读取失败");
  }
  return payload.data;
}

export function useMarketCenterOverview(enabled = true) {
  return useQuery({
    queryKey: ["market-center", "overview"],
    queryFn: ({ signal }) =>
      getData<MarketCenterOverviewResponse>("/api/v1/market-center/overview", signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useMarketRotation(
  scope: RotationScope,
  window: RotationWindow = "20D",
  enabled = true,
) {
  return useQuery({
    queryKey: ["market-center", "rotation", scope, window],
    queryFn: ({ signal }) =>
      getData<MarketRotationResponse>(
        `/api/v1/market-center/rotation?scope=${scope}&window=${window}`,
        signal,
      ),
    enabled,
    staleTime: 60_000,
  });
}

export function useMainBenchmarkRotation(
  window: RotationWindow = "20D",
  enabled = true,
) {
  return useQuery({
    queryKey: ["market-center", "main-benchmark", window],
    queryFn: ({ signal }) =>
      getData<MarketRotationResponse>(
        `/api/v1/market-center/rotation?scope=main-benchmark&window=${window}`,
        signal,
      ),
    enabled,
    staleTime: 60_000,
  });
}

export interface LatestQuote {
  symbol: string;
  name: string;
  last: string | null;
  changePct: string | null;
  amount: string | null;
  pe: string | null;
  peTtm: string | null;
  peStatic: string | null;
  pb: string | null;
  ts: string;
  source: string;
  quality: string;
}

export function useLatestQuotes(
  codes: string[],
  enabled = true,
  includeValuation = false,
) {
  const normalized = [...new Set(codes)].sort();
  return useQuery({
    queryKey: ["quotes", "latest", normalized, includeValuation],
    queryFn: async ({ signal }) => {
      if (normalized.length === 0) return [];
      return getData<LatestQuote[]>(
        `/api/v1/quotes/latest?codes=${encodeURIComponent(normalized.join(","))}${
          includeValuation ? "&includeValuation=true" : ""
        }`,
        signal,
      );
    },
    enabled: enabled && normalized.length > 0,
    staleTime: 30_000,
  });
}

export interface FundFlowHistoryRow {
  date: string;
  close: number | null;
  changePercent: number | null;
  mainNetInflow: number;
  superLargeNetInflow: number;
  largeNetInflow: number;
  mediumNetInflow: number;
  smallNetInflow: number;
}

export function useFundFlowHistory(symbol: string, limit = 5, enabled = true) {
  return useQuery({
    queryKey: ["fundflow", "history", symbol, limit],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/v1/fundflow?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
        { signal },
      );
      const payload = (await response.json()) as ApiPayload<FundFlowHistoryRow[]>;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "资金结构读取失败");
      }
      return payload.data ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useBoardFundFlow(boardCode: string, limit = 5, enabled = true) {
  return useQuery({
    queryKey: ["fundflow", "board", boardCode, limit],
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/v1/fundflow/board?board_code=${encodeURIComponent(boardCode)}&limit=${limit}`,
        { signal },
      );
      const payload = (await response.json()) as ApiPayload<FundFlowHistoryRow[]>;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "板块资金结构读取失败");
      }
      return payload.data ?? [];
    },
    enabled: enabled && Boolean(boardCode),
    staleTime: 60_000,
  });
}
