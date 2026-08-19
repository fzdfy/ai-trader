import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

// ---------- types ----------

export interface StrategyFactor {
  name: string;
  value: number; // 信号阈值 / 参数值 0-100
  weight: number; // 权重 0-100
  direction?: 1 | -1; // 方向覆盖：-1 反转因子得分
}

/** 信号层合成方式（对齐 quant factors/combine.py 的 COMBINE_MODES） */
export const COMBINE_MODES = [
  "weighted_sum",
  "equal_weight",
  "voting",
  "rank",
  "and",
  "or",
] as const;
export type CombineMode = (typeof COMBINE_MODES)[number];

/** 合成方式中文名 */
export const COMBINE_LABELS: Record<CombineMode, string> = {
  weighted_sum: "加权求和",
  equal_weight: "等权平均",
  voting: "多数投票",
  rank: "排名打分",
  and: "全部看多 (AND)",
  or: "任一看多 (OR)",
};

/** 入场方式：threshold=得分达标触发 / cross=得分上穿阈值触发 */
export type EntryType = "threshold" | "cross";

/** 阈值配置（0-100 百分比，对齐 quant composite 引擎的 entry/exit） */
export interface StrategyThreshold {
  type: EntryType;
  value: number;
}

/** 入场层配置（0-100 百分比 + 过滤开关，对齐 quant composite 引擎 entry 结构） */
export interface StrategyEntry extends StrategyThreshold {
  volumeConfirm?: boolean; // 量能确认
  limitFilter?: boolean; // 涨跌停过滤
  stFilter?: boolean; // ST 过滤
  marketFilter?: boolean; // 大盘过滤
}

/** 风险管理配置（0-100 百分比） */
export interface StrategyRisk {
  positionSize: number; // 单票仓位 0-100
  stopLoss: number; // 止损线 0-100
  takeProfit: number; // 止盈线 0-100
}

/** 策略配置 JSON（对齐 quant composite 引擎结构；entry/exit/risk 为历史数据兼容可选） */
export interface StrategyConfig {
  factors: StrategyFactor[];
  combine?: CombineMode;
  entry?: StrategyEntry;
  exit?: StrategyThreshold;
  risk?: StrategyRisk;
}

export interface Strategy {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  configJson: StrategyConfig;
  isSystem: boolean;
  isPublic: boolean;
  creator: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/** 创建/编辑策略共用的一组风控参数（0-100 百分比） */
export interface StrategyRiskInput {
  entry: number; // 入场阈值
  exit: number; // 出场阈值
  positionSize: number; // 单票仓位
  stopLoss: number; // 止损线
  takeProfit: number; // 止盈线
}

/** 入场层配置输入（创建/编辑策略共用：入场方式 + 过滤开关） */
export interface StrategyEntryInput {
  entryType: EntryType; // 入场方式
  volumeConfirm: boolean; // 量能确认
  limitFilter: boolean; // 涨跌停过滤
  stFilter: boolean; // ST 过滤
  marketFilter: boolean; // 大盘过滤
}

export interface CreateStrategyInput extends StrategyRiskInput, StrategyEntryInput {
  name: string;
  description: string;
  factors: StrategyFactor[];
  combine: CombineMode;
  isPublic: boolean;
}

export interface UpdateStrategyInput extends StrategyRiskInput, StrategyEntryInput {
  id: number;
  name: string;
  description: string;
  factors: StrategyFactor[];
  combine: CombineMode;
  isPublic: boolean;
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
  const userId = getUserId();

  return useQuery({
    queryKey: ["strategies", id, userId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/strategies/${id}`, {
        headers: { "X-User-Id": userId ?? "" },
      });
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

/** 编辑策略（name / description / factors / isPublic，仅创建者本人可改） */
export function useUpdateStrategy() {
  const queryClient = useQueryClient();
  const userId = getUserId();

  return useMutation({
    mutationFn: async (input: UpdateStrategyInput) => {
      const res = await fetch(`/api/v1/strategies/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          factors: input.factors,
          combine: input.combine,
          entry: input.entry,
          exit: input.exit,
          positionSize: input.positionSize,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit,
          entryType: input.entryType,
          volumeConfirm: input.volumeConfirm,
          limitFilter: input.limitFilter,
          stFilter: input.stFilter,
          marketFilter: input.marketFilter,
          isPublic: input.isPublic,
        }),
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

/** 删除策略（仅创建者本人可删） */
export function useDeleteStrategy() {
  const queryClient = useQueryClient();
  const userId = getUserId();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/v1/strategies/${id}`, {
        method: "DELETE",
        headers: { "X-User-Id": userId ?? "" },
      });
      const json = (await res.json()) as ApiResponse<{ id: number }>;
      if (!json.success) throw new Error((json as unknown as { error: string }).error);
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
    },
  });
}

/** 修改策略是否公开（仅创建者本人可改） */
export function useUpdateStrategyVisibility() {
  const queryClient = useQueryClient();
  const userId = getUserId();

  return useMutation({
    mutationFn: async (input: { id: number; isPublic: boolean }) => {
      const res = await fetch(`/api/v1/strategies/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-User-Id": userId ?? "" },
        body: JSON.stringify({ isPublic: input.isPublic }),
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
