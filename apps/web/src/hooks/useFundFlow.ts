/**
 * 资金流向数据 hook（TanStack Query）。
 * 手动触发模式：queryKey 由提交的 symbol 驱动，enabled 控制是否发起请求。
 */
import { useQuery } from "@tanstack/react-query";
import type { FundFlowDaily } from "../components/charts/FundFlowChart";

/** 个股资金流向（按日），点击"查看资金流"触发 */
export function useFundFlowQuery(symbol: string) {
  return useQuery({
    queryKey: ["fundflow", symbol],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/fundflow?symbol=${encodeURIComponent(symbol)}&period=daily&limit=30`,
      );
      const json = await res.json();
      return (json.success ? json.data : []) as FundFlowDaily[];
    },
    enabled: !!symbol,
    staleTime: 60_000,
  });
}
