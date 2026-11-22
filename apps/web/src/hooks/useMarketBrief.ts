import { useQuery } from "@tanstack/react-query";
import type {
  MarketBriefQueryParams,
  MarketBriefResponse,
} from "../lib/market-brief";

type ApiPayload<T> = { success: boolean; data?: T; error?: string };

export function useMarketBriefQuery(
  params: MarketBriefQueryParams,
  enabled = true,
) {
  const search = new URLSearchParams(Object.entries(params));
  return useQuery({
    queryKey: ["dashboard", "market-brief", params],
    enabled,
    queryFn: async ({ signal }): Promise<MarketBriefResponse> => {
      const response = await fetch(`/api/v1/dashboard/market-brief?${search}`, {
        signal,
      });
      const payload = (await response.json()) as ApiPayload<MarketBriefResponse>;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "行情雷达数据获取失败");
      }
      return payload.data;
    },
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}
