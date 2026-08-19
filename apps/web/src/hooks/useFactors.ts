import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

// ---------- types ----------

export interface Factor {
  name: string;
  label: string;
  category: string;
  direction: number;
  description: string | null;
  expression: string | null;
  createdBy: string;
  creator: string;
  isPublic: boolean;
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
  // 在 hook 顶层调用 useSession（渲染期间），通过 X-User-Id 让后端返回自己的私有因子
  const userId = authClient.useSession().data?.user.id;

  return useQuery({
    queryKey: ["factors", userId],
    queryFn: async () => {
      const res = await fetch("/api/v1/factors", {
        headers: { "X-User-Id": userId ?? "" },
      });
      const json = (await res.json()) as ApiResponse<Factor[]>;
      return json.success ? json.data : [];
    },
  });
}

export function useFactorQuery(name: string) {
  const userId = authClient.useSession().data?.user.id;

  return useQuery({
    queryKey: ["factors", name, userId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/factors/${encodeURIComponent(name)}`, {
        headers: { "X-User-Id": userId ?? "" },
      });
      const json = (await res.json()) as ApiResponse<Factor>;
      return json.success ? json.data : null;
    },
    enabled: !!name,
  });
}

export function useCreateFactor() {
  const queryClient = useQueryClient();
  // 在 hook 顶层调用 useSession（渲染期间），避免在 mutationFn 回调中调用 React Hook
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description: string;
      expression: string;
      isPublic: boolean;
    }) => {
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

/** 编辑因子（label / expression / description / isPublic，仅创建者本人可改） */
export function useUpdateFactor() {
  const queryClient = useQueryClient();
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (input: {
      name: string;
      label: string;
      expression: string;
      description: string;
      isPublic: boolean;
    }) => {
      const res = await fetch(`/api/v1/factors/${encodeURIComponent(input.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({
          label: input.label,
          expression: input.expression,
          description: input.description,
          isPublic: input.isPublic,
        }),
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

/** 删除因子（仅创建者本人可删） */
export function useDeleteFactor() {
  const queryClient = useQueryClient();
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/v1/factors/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: { "X-User-Id": userId ?? "" },
      });
      const json = (await res.json()) as ApiResponse<{ name: string }>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["factors"] });
    },
  });
}

/** 修改因子是否公开（仅创建者本人可改） */
export function useUpdateFactorVisibility() {
  const queryClient = useQueryClient();
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (input: { name: string; isPublic: boolean }) => {
      const res = await fetch(`/api/v1/factors/${encodeURIComponent(input.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({ isPublic: input.isPublic }),
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

/** AI 根据描述生成因子表达式（返回表达式字符串，无法表达时返回「无法生成」） */
export function useGenerateFactorExpression() {
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (description: string) => {
      const res = await fetch("/api/v1/factors/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({ description }),
      });
      const json = (await res.json()) as ApiResponse<{ expression: string }>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data.expression;
    },
  });
}
