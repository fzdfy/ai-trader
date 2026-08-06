/**
 * 热力图数据 hook（TanStack Query）。
 * 自动触发：heatType 切换即重新拉取（默认前 200 个板块，嵌套成分股）。
 */
import { useQuery } from "@tanstack/react-query";
import type { HeatmapItem } from "../components/charts/HeatmapChart";

export function useHeatmapQuery(type: "industry" | "concept") {
  return useQuery({
    queryKey: ["heatmap", type],
    queryFn: async () => {
      const res = await fetch(`/api/v1/heatmap?type=${type}&top=200`);
      const json = await res.json();
      return (json.success ? json.data?.data ?? [] : []) as HeatmapItem[];
    },
    staleTime: 60_000,
  });
}

/**
 * 单个板块的成分股（点击板块下钻用）：仅在上层 children 缺失时启用。
 * 数据源：数据库缓存优先，缺失时后端实时拉取并落库（东财恢复后自动补齐）。
 */
export function useHeatmapBoardQuery(
  type: "industry" | "concept",
  code: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["heatmap-board", type, code],
    queryFn: async () => {
      const res = await fetch(`/api/v1/heatmap/board?type=${type}&code=${encodeURIComponent(code)}`);
      const json = await res.json();
      return (json.success ? json.data?.data ?? [] : []) as HeatmapItem[];
    },
    enabled: enabled && !!code,
    staleTime: 60_000,
  });
}
