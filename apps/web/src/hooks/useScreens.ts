import { useMutation } from "@tanstack/react-query";

// ---------- types ----------

export interface ScreenItem {
  symbol: string;
  name: string;
  score: number; // 综合得分 0-100
  close: number; // 最新收盘价
  factorScores: Record<string, number>; // 因子名 → 得分 0-100
}

export interface ScreenResult {
  items: ScreenItem[];
  total: number; // 参与打分的标的数
  strategy: { id: number; name: string };
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface RunScreenInput {
  strategyId: number;
  topN: number;
}

// ---------- hooks ----------

export function useRunScreen() {
  return useMutation({
    mutationFn: async (input: RunScreenInput): Promise<ScreenResult> => {
      const res = await fetch("/api/v1/screens/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as ApiResponse<ScreenResult>;
      if (!json.success) throw new Error(json.error ?? "选股失败");
      return json.data;
    },
  });
}
