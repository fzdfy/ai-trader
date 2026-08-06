/**
 * 筹码分布数据 hook（TanStack Query）。
 * 手动触发模式：queryKey 由提交的 key 驱动，enabled 控制是否发起请求。
 */
import { useQuery } from "@tanstack/react-query";
import type { ChipPoint } from "../components/charts/ChipsChart";

export interface ChipsResult {
  symbol?: string;
  boardCode?: string;
  currentPrice: number;
  avgCost: number;
  profitRatio: number;
  cost90: { low: number; high: number };
  cost70: { low: number; high: number };
  distribution: ChipPoint[];
}

export interface BoardOption {
  code: string;
  name: string;
}

/** 行业板块列表（行业模式下拉框用） */
export function useIndustryBoardsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["boards", "industry"],
    queryFn: async () => {
      const res = await fetch("/api/v1/boards?type=industry");
      const json = await res.json();
      return (json.success ? json.data : []) as BoardOption[];
    },
    enabled,
    staleTime: 60_000,
  });
}

/** 筹码分布（个股 / 行业板块），点击"计算筹码"触发 */
export function useChipsQuery(mode: "stock" | "board", key: string) {
  const endpoint =
    mode === "stock"
      ? `/api/v1/chips?symbol=${encodeURIComponent(key)}&days=250&bins=48`
      : `/api/v1/chips/board?code=${encodeURIComponent(key)}&days=250&bins=48`;
  return useQuery({
    queryKey: ["chips", mode, key],
    queryFn: async () => {
      const res = await fetch(endpoint);
      const json = await res.json();
      return (json.success ? json.data : null) as ChipsResult | null;
    },
    enabled: !!key,
    staleTime: 60_000,
  });
}
