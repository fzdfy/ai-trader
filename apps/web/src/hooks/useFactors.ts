import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

// ---------- types ----------

export interface Factor {
  name: string;
  label: string;
  category: string;
  direction: number;
  description: string | null;
  kind: string;
  expression: string | null;
  code: string | null;
  createdBy: string;
  creator: string;
  isPublic: boolean;
  createdAt: string;
}

/** 因子定义方式：expression=AKQuant 因子表达式；python=Python 代码 */
export type FactorKind = "expression" | "python";

/** 因子定义方式中文名 */
export const FACTOR_KIND_LABELS: Record<FactorKind, string> = {
  expression: "表达式",
  python: "Python",
};

/** 创建 / 编辑因子的定义草稿（两种方式共用；按 kind 只有一种生效） */
export interface FactorDraft {
  name: string;
  description: string;
  kind: FactorKind;
  expression: string;
  code: string;
  isPublic: boolean;
}

/** 编辑草稿 = 定义草稿 + 显示名称 */
export interface FactorEditDraft extends FactorDraft {
  label: string;
}

/** 后端返回的 kind 为自由字符串，归一化为两种方式之一 */
export function normalizeFactorKind(value: string | null | undefined): FactorKind {
  return value === "python" ? "python" : "expression";
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

// ---------- 请求函数（hook 与 Route loader 共用） ----------

/** 拉取因子列表（含自己的私有因子）；loader 中无 React 上下文，由调用方传入 userId */
export async function fetchFactors(userId: string): Promise<Factor[]> {
  const res = await fetch("/api/v1/factors", {
    headers: { "X-User-Id": userId },
  });
  const json = (await res.json()) as ApiResponse<Factor[]>;
  return json.success ? json.data : [];
}

// ---------- hooks ----------

export function useFactorsQuery() {
  // 在 hook 顶层调用 useSession（渲染期间），通过 X-User-Id 让后端返回自己的私有因子
  const userId = authClient.useSession().data?.user.id;

  return useQuery({
    queryKey: ["factors", userId],
    queryFn: () => fetchFactors(userId ?? ""),
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
    mutationFn: async (input: FactorDraft) => {
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

/** 编辑因子（label / kind / expression / code / description / isPublic，仅创建者本人可改） */
export function useUpdateFactor() {
  const queryClient = useQueryClient();
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (input: FactorEditDraft) => {
      const res = await fetch(`/api/v1/factors/${encodeURIComponent(input.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({
          label: input.label,
          kind: input.kind,
          expression: input.expression,
          code: input.code,
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
