import { useCallback, useEffect, useRef, useState } from "react";
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

/** 内置因子分类中文名（category 为英文 key） */
export const FACTOR_CATEGORY_LABELS: Record<string, string> = {
  momentum: "动量",
  trend: "趋势",
  volume: "成交量",
  volatility: "波动",
  custom: "自定义",
};

/** qlib Alpha158 滚动算子中文名（category 形如 qlib/alpha158/rolling/<OP>） */
const ALPHA158_ROLLING_LABELS: Record<string, string> = {
  ROC: "变动率",
  MA: "均线比",
  STD: "波动率比",
  MAX: "最高价比",
  MIN: "最低价比",
  RANK: "价格分位",
  RSV: "随机指标",
  IMAX: "高点距今天数",
  IMIN: "低点距今天数",
  IMXD: "高低点间隔",
  CORR: "价量相关",
  CORD: "价量变化相关",
  CNTP: "上涨天数占比",
  CNTN: "下跌天数占比",
  CNTD: "涨跌天数差",
  SUMP: "涨幅占比",
  SUMN: "跌幅占比",
  SUMD: "涨跌占比差",
  VMA: "量均线比",
  VSTD: "量波动比",
  WVMA: "量价波动",
  VSUMP: "增量占比",
  VSUMN: "减量占比",
  VSUMD: "增减量占比差",
};

/** qlib Alpha360 分组中文名（category 形如 qlib/alpha360/<GROUP>） */
const ALPHA360_GROUP_LABELS: Record<string, string> = {
  CLOSE: "收盘价",
  OPEN: "开盘价",
  HIGH: "最高价",
  LOW: "最低价",
  VOLUME: "成交量",
  VWAP: "成交额均价",
};

/** WorldQuant Alpha101 分类 key（种子库内置） */
const ALPHA101_CATEGORY = "alpha101";
const ALPHA101_GROUP = "Alpha101";

const ALPHA158_ROLLING_PREFIX = "qlib/alpha158/rolling/";
const ALPHA360_PREFIX = "qlib/alpha360/";

/** 因子分类的中文分组标题（用于筛选器分组） */
export function factorCategoryGroup(category: string): string {
  if (category in FACTOR_CATEGORY_LABELS) return "自定义分类";
  if (category === ALPHA101_CATEGORY) return ALPHA101_GROUP;
  if (category.startsWith("qlib/alpha158/")) return "qlib · Alpha158";
  if (category.startsWith(ALPHA360_PREFIX)) return "qlib · Alpha360";
  return "其他";
}

/** 把 category key 转成中文名（兼容自定义分类与 qlib 导入分类） */
export function formatFactorCategory(category: string): string {
  const builtin = FACTOR_CATEGORY_LABELS[category];
  if (builtin) return builtin;
  if (category === ALPHA101_CATEGORY) return "α101 · WorldQuant";
  if (category === "qlib/alpha158/kbar") return "α158 · K线形态";
  if (category === "qlib/alpha158/price") return "α158 · 价格";
  if (category.startsWith(ALPHA158_ROLLING_PREFIX)) {
    const op = category.slice(ALPHA158_ROLLING_PREFIX.length);
    return `α158 · ${ALPHA158_ROLLING_LABELS[op] ?? op}`;
  }
  if (category.startsWith(ALPHA360_PREFIX)) {
    const group = category.slice(ALPHA360_PREFIX.length);
    return `α360 · ${ALPHA360_GROUP_LABELS[group] ?? group}`;
  }
  return category;
}

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

// ---------- 因子检验（IC / RankIC / ICIR / 分层回测 / 衰退） ----------

/** 逐日 IC 一条（date 为 YYYY-MM-DD） */
export interface FactorIcPoint {
  date: string;
  ic: number;
  rankIc: number;
  count: number;
}

/** IC / RankIC 序列汇总指标 */
export interface FactorIcSummary {
  mean: number | null;
  std: number | null;
  /** ICIR = mean(IC) / std(IC) */
  icir: number | null;
  /** t 值 = ICIR × sqrt(交易日数) */
  tStat: number | null;
  /** IC > 0 的交易日占比 */
  positiveRatio: number | null;
  /** 年化 ICIR = ICIR × sqrt(252) */
  icirAnnual: number | null;
  count: number;
}

/** 分层回测单层汇总（第 1 层因子值最低） */
export interface FactorLayerSummary {
  layer: number;
  cumRet: number;
  meanRet: number;
  annRet: number | null;
  winRate: number;
  days: number;
}

/** 多空组合（最高层 - 最低层）汇总 */
export interface FactorLongShortSummary {
  cumRet: number;
  meanRet: number;
  annRet: number | null;
  winRate: number | null;
}

/** 分层回测结果（nav 键为 L1..LN 与 longShort） */
export interface FactorLayerBacktest {
  count: number;
  dates: string[];
  nav: Record<string, number[]>;
  summary: FactorLayerSummary[];
  longShort: FactorLongShortSummary;
}

/** 因子衰退一点（不同持有期下的 IC 水平） */
export interface FactorDecayPoint {
  horizon: number;
  icMean: number | null;
  rankIcMean: number | null;
  icir: number | null;
  count: number;
}

/** 分位换手率单层（第 1 层因子值最低） */
export interface FactorTurnoverLayer {
  layer: number;
  turnover: number | null;
}

/** 分位换手率（相邻交易日各分层持仓的变动比例；衡量调仓成本） */
export interface FactorTurnover {
  mean: number | null;
  byLayer: FactorTurnoverLayer[];
  count: number;
}

/** 秩自相关（相邻交易日因子排名的一致性；越高越稳定） */
export interface FactorRankAutocorr {
  mean: number | null;
  std: number | null;
  count: number;
}

/** 多空组合 vs 市场等权收益的 OLS 回归（alpha 为选股超额，beta 为市场暴露） */
export interface FactorAlphaBeta {
  alpha: number | null;
  beta: number | null;
  rSquared: number | null;
  annualAlpha: number | null;
  count: number;
}

/** IC 正态性 QQ 图一点 */
export interface FactorIcQqPoint {
  theoretical: number;
  sample: number;
}

/** IC 正态性（偏度/峰度/Jarque-Bera 检验 + QQ 数据） */
export interface FactorIcNormality {
  skew: number | null;
  kurtosis: number | null;
  jarqueBera: number | null;
  pValue: number | null;
  count: number;
  qq: FactorIcQqPoint[];
}

/** 月度 IC 一点（month 为 YYYY-MM） */
export interface FactorMonthlyIc {
  month: string;
  ic: number | null;
  rankIc: number | null;
  count: number;
}

/** 样本切分信息（validRatio>0 且样本充足时非空） */
export interface FactorEvaluationSplit {
  /** 样本外占比（0~0.5） */
  validRatio: number;
  /** 样本外起始交易日（YYYY-MM-DD） */
  splitDate: string;
}

/** 样本外(valid)区间汇总；未切分或样本外无法计算时为 null */
export interface FactorValidSummary {
  ic: FactorIcSummary;
  rankIc: FactorIcSummary;
  longShort: FactorLongShortSummary;
  turnover: FactorTurnover;
  rankAutocorr: FactorRankAutocorr;
  alphaBeta: FactorAlphaBeta;
  monthlyIc: FactorMonthlyIc[];
  /** 样本外有效截面交易日数 */
  sampleCount: number;
  startDate: string;
  endDate: string;
}

/** 因子检验结果 */
export interface FactorEvaluation {
  expression: string;
  universe: {
    symbols: number;
    bars: number;
    startDate: string;
    endDate: string;
  };
  horizon: number;
  ic: FactorIcSummary;
  rankIc: FactorIcSummary;
  icSeries: FactorIcPoint[];
  layers: FactorLayerBacktest;
  /** 分位换手率（衡量调仓成本） */
  turnover: FactorTurnover;
  /** 秩自相关（因子排名稳定性） */
  rankAutocorr: FactorRankAutocorr;
  /** 多空组合 vs 市场等权回归（alpha/beta） */
  alphaBeta: FactorAlphaBeta;
  /** IC 正态性（偏度/峰度/JB 检验/QQ） */
  icNormality: FactorIcNormality;
  /** 月度 IC */
  monthlyIc: FactorMonthlyIc[];
  decay: FactorDecayPoint[];
  /** 样本切分信息；未切分（validRatio=0 或样本不足）时为 null */
  split: FactorEvaluationSplit | null;
  /** 样本外(OOS)指标；未切分或样本外无法计算时为 null */
  valid: FactorValidSummary | null;
  elapsedMs: number;
}

/** 因子检验参数（均可省略，交由 quant 侧默认值与上限钳制） */
export interface FactorEvaluationParams {
  horizon?: number;
  layers?: number;
  bars?: number;
  maxSymbols?: number;
  minSymbols?: number;
  horizons?: number[];
  /** 样本外占比（0~0.5）：>0 时按交易日切分样本内/样本外，用于度量过拟合 */
  validRatio?: number;
  /**
   * PIT 复权基准日（YYYY-MM-DD）：只采用该日之前（known_at <= asOf）的复权因子快照，
   * 等价于「站在历史某时刻」回放，用于消除前视偏差；留空即用最新快照。
   */
  asOf?: string;
}

/**
 * 因子检验：在全市场面板上计算 IC / RankIC / ICIR、分层回测与因子衰退。
 *
 * 计算较重（quant 侧需从库中取最多 maxSymbols 只标的、约 bars 根日线组成面板），
 * 耗时可达数十秒；表达式因子与 Python 代码因子均可用（后者由 quant 侧受限执行）。
 * 传 validRatio>0 时另返回 split 与样本外(OOS)指标，用于判断过拟合。
 */
export function useFactorEvaluation(name: string) {
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (params: FactorEvaluationParams = {}) => {
      const res = await fetch(`/api/v1/factors/${encodeURIComponent(name)}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify(params),
      });
      const json = (await res.json()) as ApiResponse<FactorEvaluation>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
  });
}

// ---------- 因子批量检验（列表页指标列 + 后台批量落库） ----------

/** 落库的因子检验结果行（GET /evaluations 返回；一行 = 一个因子最近一次检验快照） */
export interface FactorEvaluationRow {
  factorName: string;
  category: string;
  horizon: number;
  icMean: number | null;
  icStd: number | null;
  icir: number | null;
  tStat: number | null;
  icPositiveRatio: number | null;
  rankIcMean: number | null;
  rankIcir: number | null;
  longShortCumRet: number | null;
  longShortAnnRet: number | null;
  longShortWinRate: number | null;
  /** 分位换手率均值（衡量调仓成本） */
  turnoverMean: number | null;
  /** 秩自相关均值（因子排名稳定性） */
  rankAutocorrMean: number | null;
  /** 多空组合 beta（市场暴露） */
  longShortBeta: number | null;
  /** 多空组合年化 alpha（选股超额） */
  longShortAlpha: number | null;
  /** IC 偏度 */
  icSkew: number | null;
  /** IC 峰度 */
  icKurtosis: number | null;
  sampleCount: number;
  symbols: number;
  bars: number;
  startDate: string | null;
  endDate: string | null;
  /** 因子衰退曲线：各持有期的 IC / RankIC / ICIR（供跨因子衰退对比页） */
  decay: FactorDecayPoint[] | null;
  /** 诊断指标完整结构（换手率/秩自相关/alpha-beta/IC 正态性/月度 IC） */
  diagnostics: {
    turnover: FactorTurnover;
    rankAutocorr: FactorRankAutocorr;
    alphaBeta: FactorAlphaBeta;
    icNormality: FactorIcNormality;
    monthlyIc: FactorMonthlyIc[];
  } | null;
  /** 该因子检验失败时的原因；成功时为 null */
  error: string | null;
  elapsedMs: number | null;
  updatedAt: string;
}

/** 批量检验任务状态（GET /evaluations/status 返回；无任务时为 idle） */
export interface FactorEvaluationStatus {
  status: "idle" | "pending" | "running" | "success" | "failed";
  total: number | null;
  processed: number | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

const IDLE_EVALUATION_STATUS: FactorEvaluationStatus = {
  status: "idle",
  total: null,
  processed: null,
  message: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

/** 拉取全部因子的最近一次检验结果（因子名 → 指标） */
export async function fetchFactorEvaluations(): Promise<FactorEvaluationRow[]> {
  const res = await fetch("/api/v1/factors/evaluations");
  const json = (await res.json()) as ApiResponse<FactorEvaluationRow[]>;
  return json.success ? json.data : [];
}

/** 因子检验结果列表（列表页指标列数据源） */
export function useFactorEvaluationsQuery() {
  return useQuery({
    queryKey: ["factor-evaluations"],
    queryFn: fetchFactorEvaluations,
  });
}

/**
 * 批量检验任务状态。任务进行中时按 3s 轮询进度，落定后自动停止；
 * 由「进行中」转入成功/失败时刷新结果列表，让指标列立即更新。
 */
export function useFactorEvaluationStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["factor-evaluations", "status"],
    queryFn: async (): Promise<FactorEvaluationStatus> => {
      const res = await fetch("/api/v1/factors/evaluations/status");
      const json = (await res.json()) as ApiResponse<FactorEvaluationStatus>;
      return json.success ? json.data : IDLE_EVALUATION_STATUS;
    },
    refetchInterval: (q) => (q.state.data?.status === "running" ? 3000 : false),
  });

  const status = query.data?.status ?? null;
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (prevStatus.current === "running" && (status === "success" || status === "failed")) {
      queryClient.invalidateQueries({ queryKey: ["factor-evaluations"] });
    }
    prevStatus.current = status;
  }, [status, queryClient]);

  return query;
}

/**
 * 触发批量检验（后台串行执行，立即返回 runId）。可传 names 限定子集（列表页按当前筛选传入）；
 * 不传则检验当前用户可见的全部表达式因子。
 */
export function useRefreshFactorEvaluations() {
  const queryClient = useQueryClient();
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (input: { names?: string[] } = {}) => {
      const res = await fetch("/api/v1/factors/evaluations/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as ApiResponse<{
        accepted: boolean;
        runId: number;
        total: number;
      }>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["factor-evaluations"] });
    },
  });
}

// ---------- AI 因子迭代（路线 B 闭环：生成 → 评价 → 反馈 → 迭代） ----------

/** 单轮迭代轨迹（GET /iterate/runs/:runId 的 rounds 元素，对应 factor_iteration 一行） */
export interface FactorIterateRound {
  id: number;
  runId: number;
  /** 轮次（从 1 开始） */
  round: number;
  /** evaluated=评价成功 | invalid=校验未通过 | failed=生成/评价异常 | stopped=主动终止 */
  status: string;
  expression: string | null;
  /** IC 均值（Pearson） */
  icMean: number | null;
  /** RankIC 均值（Spearman） */
  rankIcMean: number | null;
  icir: number | null;
  tStat: number | null;
  /** IC > 0 的交易日占比 */
  positiveRatio: number | null;
  longShortAnnRet: number | null;
  longShortCumRet: number | null;
  /** 分层单调性 */
  monotonicity: number | null;
  /** 衰退保留率 */
  retention: number | null;
  /** 跨轮排序的综合评分 */
  score: number | null;
  sampleCount: number | null;
  symbols: number | null;
  /** 样本外占比（0~0.5）；0 或 null 表示未做切分 */
  validRatio: number | null;
  /** 样本外起始交易日（YYYY-MM-DD）；未切分为空 */
  splitDate: string | null;
  /** 样本外 IC 均值（Pearson） */
  validIcMean: number | null;
  /** 样本外 RankIC 均值（Spearman 秩相关） */
  validRankIcMean: number | null;
  /** 样本外 ICIR = mean(IC) / std(IC) */
  validIcir: number | null;
  /** 样本外分层多空组合年化收益 */
  validLongShortAnnRet: number | null;
  /** 样本外分层多空组合累计收益 */
  validLongShortCumRet: number | null;
  /** 样本外有效截面交易日数 */
  validSampleCount: number | null;
  /** 非成功轮的原因说明（成功轮为空） */
  message: string | null;
  /** 是否为本次任务的最佳轮 */
  isBest: boolean;
  createdAt: string;
}

/** 迭代任务（GET /iterate/runs[/:runId] 的 run，对应 job_run 一行） */
export interface FactorIterateRun {
  id: number;
  status: string;
  total: number | null;
  processed: number | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

/** 迭代任务状态（GET /iterate/status 返回；无任务时为 idle） */
export interface FactorIterateStatus {
  status: "idle" | "pending" | "running" | "success" | "failed";
  total: number | null;
  processed: number | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

/** 触发 AI 迭代的参数（除 description 外均可省略，交由服务端默认值与上限钳制） */
export interface FactorIterateParams {
  description: string;
  /** 最多迭代轮次，服务端默认 3、上限 5 */
  rounds?: number;
  horizon?: number;
  layers?: number;
  bars?: number;
  maxSymbols?: number;
  minSymbols?: number;
}

/** 单次迭代详情：任务 + 逐轮轨迹 */
export interface FactorIterateDetail {
  run: FactorIterateRun;
  rounds: FactorIterateRound[];
}

const IDLE_ITERATE_STATUS: FactorIterateStatus = {
  status: "idle",
  total: null,
  processed: null,
  message: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

/**
 * 触发 AI 因子迭代（后台执行，立即返回 runId）。
 * 采纳最佳轮仍需另行调用 useCreateFactor 落库，迭代本身不写因子表。
 */
export function useFactorIterate() {
  const queryClient = useQueryClient();
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (params: FactorIterateParams) => {
      const res = await fetch("/api/v1/factors/iterate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify(params),
      });
      const json = (await res.json()) as ApiResponse<{
        accepted: boolean;
        runId: number;
        total: number;
      }>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["factor-iterate", "status"] });
      queryClient.invalidateQueries({ queryKey: ["factor-iterate", "runs"] });
    },
  });
}

/**
 * AI 迭代任务状态。任务进行中时按 3s 轮询进度，落定后自动停止；
 * 由「进行中」转入成功/失败时刷新历史列表，让轨迹入口立即更新。
 */
export function useFactorIterateStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["factor-iterate", "status"],
    queryFn: async (): Promise<FactorIterateStatus> => {
      const res = await fetch("/api/v1/factors/iterate/status");
      const json = (await res.json()) as ApiResponse<FactorIterateStatus>;
      return json.success ? json.data : IDLE_ITERATE_STATUS;
    },
    refetchInterval: (q) => (q.state.data?.status === "running" ? 3000 : false),
  });

  const status = query.data?.status ?? null;
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (prevStatus.current === "running" && (status === "success" || status === "failed")) {
      queryClient.invalidateQueries({ queryKey: ["factor-iterate", "runs"] });
    }
    prevStatus.current = status;
  }, [status, queryClient]);

  return query;
}

/** 最近若干次 AI 迭代任务（历史轨迹入口） */
export function useFactorIterateRuns(limit = 10) {
  return useQuery({
    queryKey: ["factor-iterate", "runs", limit],
    queryFn: async (): Promise<FactorIterateRun[]> => {
      const res = await fetch(`/api/v1/factors/iterate/runs?limit=${limit}`);
      const json = (await res.json()) as ApiResponse<{ runs: FactorIterateRun[] }>;
      return json.success ? json.data.runs : [];
    },
  });
}

/** 单次 AI 迭代的逐轮轨迹；任务进行中时按 3s 轮询，落定后自动停止 */
export function useFactorIterateRun(runId: number | null | undefined) {
  return useQuery({
    queryKey: ["factor-iterate", "run", runId],
    enabled: runId != null,
    queryFn: async (): Promise<FactorIterateDetail> => {
      const res = await fetch(`/api/v1/factors/iterate/runs/${runId}`);
      const json = (await res.json()) as ApiResponse<FactorIterateDetail>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    refetchInterval: (q) => (q.state.data?.run.status === "running" ? 3000 : false),
  });
}
