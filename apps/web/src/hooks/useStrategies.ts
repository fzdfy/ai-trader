import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

// ---------- types ----------

export interface StrategyFactor {
  name: string;
  value: number; // 信号阈值 / 参数值 0-100
  weight: number; // 权重 0-100
}

export interface Strategy {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  configJson: { factors: StrategyFactor[] };
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface CreateStrategyInput {
  name: string;
  description: string;
  factors: StrategyFactor[];
}

function getUserId() {
  return authClient.useSession().data?.user.id;
}

// ---------- hooks ----------

export function useStrategiesQuery() {
  const userId = getUserId();

  return useQuery({
    queryKey: ["strategies", userId],
    queryFn: async () => {
      const res = await fetch("/api/v1/strategies", {
        headers: { "X-User-Id": userId ?? "" },
      });
      const json = (await res.json()) as ApiResponse<Strategy[]>;
      return json.success ? json.data : [];
    },
  });
}

export function useStrategyQuery(id: number) {
  return useQuery({
    queryKey: ["strategies", id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/strategies/${id}`);
      const json = (await res.json()) as ApiResponse<Strategy>;
      return json.success ? json.data : null;
    },
    enabled: !!id,
  });
}

export function useCreateStrategy() {
  const queryClient = useQueryClient();
  const userId = getUserId();

  return useMutation({
    mutationFn: async (input: CreateStrategyInput) => {
      const res = await fetch("/api/v1/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as ApiResponse<Strategy>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
    },
  });
}
