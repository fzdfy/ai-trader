/**
 * 选股池数据 hook（TanStack Query）。
 * 选股池 = 落库表（区别于前端内存的"结果集合"），支持按日回放。
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AddStockPoolItem {
  symbol: string;
  name: string;
  source?: string;
  score?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/** 加入选股池（从选股结果勾选后提交） */
export function useAddStockPool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { date?: string; items: AddStockPoolItem[] }) => {
      const res = await fetch("/api/v1/stock-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as ApiResponse<{ date: string; count: number }>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stock-pool", data.date] });
      queryClient.invalidateQueries({ queryKey: ["stock-pool", "dates"] });
    },
  });
}

/** 回放某交易日选股池 */
export function useStockPoolQuery(date: string | null) {
  return useQuery({
    queryKey: ["stock-pool", date ?? ""],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/stock-pool?date=${encodeURIComponent(date ?? "")}`,
      );
      const json = (await res.json()) as ApiResponse<
        { symbol: string; name: string; source: string | null; score: string | null }[]
      >;
      return json.success ? json.data : [];
    },
    enabled: !!date,
  });
}

/** 选股池日期列表 */
export function useStockPoolDatesQuery() {
  return useQuery({
    queryKey: ["stock-pool", "dates"],
    queryFn: async () => {
      const res = await fetch("/api/v1/stock-pool/dates");
      const json = (await res.json()) as ApiResponse<string[]>;
      return json.success ? json.data : [];
    },
  });
}
