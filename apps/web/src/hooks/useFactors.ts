import { useCallback, useState } from "react";
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

/** AI 生成的因子代码结果：code 为「无法生成」哨兵时，reason 说明校验失败原因 */
export interface GeneratedFactorCode {
  code: string;
  reason?: string;
}

/**
 * AI 根据描述生成因子 Python 代码。
 * 服务端生成后会先用白名单静态校验、再用真实库小样本实际执行 compute 校验能否运行，
 * 任一环节失败都返回哨兵「无法生成」，并在 reason 中带上具体原因。
 */
export function useGenerateFactorCode() {
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (description: string) => {
      const res = await fetch("/api/v1/factors/generate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({ description }),
      });
      const json = (await res.json()) as ApiResponse<GeneratedFactorCode>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
  });
}

/** 因子表达式校验结果（stage：syntax 引擎编译 / data 样本不足 / runtime 求值失败 / executed 已成功求值） */
export interface FactorExpressionValidation {
  valid: boolean;
  stage: "syntax" | "data" | "runtime" | "executed";
  reason: string | null;
  sampleSymbols: string[];
}

/** 校验因子表达式能否运行（静态白名单 + AKQuant 引擎编译 + 真实库小样本实际求值） */
export function useValidateFactorExpression() {
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (expression: string) => {
      const res = await fetch("/api/v1/factors/validate-expression", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({ expression }),
      });
      const json = (await res.json()) as ApiResponse<FactorExpressionValidation>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
  });
}

/** 因子代码校验结果（stage：syntax 静态校验 / data 样本不足 / runtime 执行失败 / executed 已成功运行） */
export interface FactorCodeValidation {
  valid: boolean;
  stage: "syntax" | "data" | "runtime" | "executed";
  reason: string | null;
  sampleSymbols: string[];
}

/** 校验因子 Python 代码能否运行（静态白名单 + 真实库小样本实际执行 compute） */
export function useValidateFactorCode() {
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/v1/factors/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as ApiResponse<FactorCodeValidation>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
  });
}

/** 单个定义（表达式 / 代码）的「测试」状态 */
export interface DefinitionTestState {
  /** 测试请求进行中 */
  isPending: boolean;
  /** 测试未通过的原因（空串表示无错误） */
  error: string;
  /** 测试通过后的提示文案 */
  success: string;
  /** 当前值是否已通过测试（空值一律视为未通过） */
  isVerified: (value: string) => boolean;
  /** 触发一次测试 */
  test: (value: string) => Promise<void>;
  /** 清空测试结果（编辑定义时调用） */
  clear: () => void;
}

/**
 * 因子定义（表达式 / Python 代码）的「测试」状态管理。
 *
 * 记录「最近一次通过测试的定义原文」，与当前输入比对即得是否已验证：编辑定义立即失效、
 * 需重新测试；改回原文则自动恢复为已通过。initial* 传入已保存的定义时直接视为已通过
 * （保存时服务端已校验），避免只改名称 / 描述等属性也被强制重测。
 */
export function useFactorDefinitionTesting(initialExpression: string, initialCode: string) {
  const validateExpression = useValidateFactorExpression();
  const validateCode = useValidateFactorCode();

  const [expressionTested, setExpressionTested] = useState(() => initialExpression.trim());
  const [expressionError, setExpressionError] = useState("");
  const [expressionSuccess, setExpressionSuccess] = useState("");
  const [codeTested, setCodeTested] = useState(() => initialCode.trim());
  const [codeError, setCodeError] = useState("");
  const [codeSuccess, setCodeSuccess] = useState("");

  // 弹框复用同一实例时（创建因子反复打开），清空全部测试状态，避免上次已通过的定义被判为已验证
  const reset = useCallback(() => {
    setExpressionTested("");
    setExpressionError("");
    setExpressionSuccess("");
    setCodeTested("");
    setCodeError("");
    setCodeSuccess("");
  }, []);

  const expression: DefinitionTestState = {
    isPending: validateExpression.isPending,
    error: expressionError,
    success: expressionSuccess,
    isVerified: (value) => expressionTested !== "" && expressionTested === value.trim(),
    clear: () => {
      setExpressionError("");
      setExpressionSuccess("");
    },
    test: async (value) => {
      const definition = value.trim();
      if (!definition) return;
      try {
        const result = await validateExpression.mutateAsync(definition);
        if (result.valid) {
          const samples = result.sampleSymbols.slice(0, 3).join("、");
          setExpressionTested(definition);
          setExpressionError("");
          setExpressionSuccess(samples ? `已通过运行校验（样本：${samples}）` : "已通过运行校验");
        } else {
          setExpressionTested("");
          setExpressionError(result.reason ?? "表达式校验未通过");
          setExpressionSuccess("");
        }
      } catch {
        setExpressionTested("");
        setExpressionError("校验服务暂时不可用，请稍后重试");
        setExpressionSuccess("");
      }
    },
  };

  const code: DefinitionTestState = {
    isPending: validateCode.isPending,
    error: codeError,
    success: codeSuccess,
    isVerified: (value) => codeTested !== "" && codeTested === value.trim(),
    clear: () => {
      setCodeError("");
      setCodeSuccess("");
    },
    test: async (value) => {
      const definition = value.trim();
      if (!definition) return;
      try {
        const result = await validateCode.mutateAsync(definition);
        if (result.valid) {
          const samples = result.sampleSymbols.slice(0, 3).join("、");
          setCodeTested(definition);
          setCodeError("");
          setCodeSuccess(samples ? `已通过运行校验（样本：${samples}）` : "已通过运行校验");
        } else {
          setCodeTested("");
          setCodeError(result.reason ?? "代码校验未通过");
          setCodeSuccess("");
        }
      } catch {
        setCodeTested("");
        setCodeError("校验服务暂时不可用，请稍后重试");
        setCodeSuccess("");
      }
    },
  };

  return { expression, code, reset };
}
