import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

// ---------- types ----------

export interface Factor {
  name: string;
  label: string;
  category: string;
  direction: number;
  description: string | null;
  createdBy: string;
  creator: string;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/** 因子分类中文名（category 为英文 key） */
export const FACTOR_CATEGORY_LABELS: Record<string, string> = {
  momentum: "动量",
  trend: "趋势",
  volume: "成交量",
  volatility: "波动",
  custom: "自定义",
};

// ---------- hooks ----------

export function useFactorsQuery() {
  return useQuery({
    queryKey: ["factors"],
    queryFn: async () => {
      const res = await fetch("/api/v1/factors");
      const json = (await res.json()) as ApiResponse<Factor[]>;
      return json.success ? json.data : [];
    },
  });
}

export function useFactorQuery(name: string) {
  return useQuery({
    queryKey: ["factors", name],
    queryFn: async () => {
      const res = await fetch(`/api/v1/factors/${encodeURIComponent(name)}`);
      const json = (await res.json()) as ApiResponse<Factor>;
      return json.success ? json.data : null;
    },
    enabled: !!name,
  });
}

export function useCreateFactor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description: string }) => {
      const userId = authClient.useSession().data?.user.id;
      const res = await fetch("/api/v1/factors", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as ApiResponse<Factor>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["factors"] });
    },
  });
}
