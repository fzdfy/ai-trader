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

/** 出场方式：threshold=得分≤阈值触发 / cross=得分下穿阈值触发 */
export type ExitType = "threshold" | "cross";

/** 止损方式：fixed=固定百分比 / trailing=移动止损 / atr=ATR 波动止损 */
export type StopType = "fixed" | "trailing" | "atr";

/** 止损方式中文名 */
export const STOP_TYPE_LABELS: Record<StopType, string> = {
  fixed: "固定百分比",
  trailing: "移动止损",
  atr: "ATR 止损",
};

/** 止盈方式：fixed=固定百分比 / trailing=移动止盈 */
export type TakeType = "fixed" | "trailing";

/** 止盈方式中文名 */
export const TAKE_TYPE_LABELS: Record<TakeType, string> = {
  fixed: "固定百分比",
  trailing: "移动止盈",
};

/** 仓位计算方式：fixed=固定比例 / kelly=凯利公式 / atr=ATR 波动率目标 */
export type PositionSizing = "fixed" | "kelly" | "atr";

/** 仓位计算方式中文名 */
export const POSITION_SIZING_LABELS: Record<PositionSizing, string> = {
  fixed: "固定比例",
  kelly: "凯利公式",
  atr: "ATR 波动率",
};

/** 滑点方式：percent=按比例（万分比） / fixed=固定金额（元） */
export type SlippageType = "percent" | "fixed";

/** 滑点方式中文名 */
export const SLIPPAGE_TYPE_LABELS: Record<SlippageType, string> = {
  percent: "按比例",
  fixed: "固定金额",
};

/** 阈值配置（0-100 百分比，对齐 quant composite 引擎的 entry/exit） */
export interface StrategyThreshold {
  type: EntryType;
  value: number;
}

/** 出场层配置（0-100 百分比 + 出场方式 + 持仓时间上限） */
export interface StrategyExit {
  type: ExitType;
  value: number; // 出场阈值 0-100
  maxHoldingDays: number; // 持仓时间上限（交易日，0=不限）
}

/** 入场层配置（0-100 百分比 + 过滤开关，对齐 quant composite 引擎 entry 结构） */
export interface StrategyEntry extends StrategyThreshold {
  volumeConfirm?: boolean; // 量能确认
  limitFilter?: boolean; // 涨跌停过滤
  stFilter?: boolean; // ST 过滤
  marketFilter?: boolean; // 大盘过滤
}

/** 风险管理配置（0-100 百分比；stopType/takeType 为枚举） */
export interface StrategyRisk {
  positionSize: number; // 单票仓位 0-100
  stopLoss: number; // 固定止损线 0-100
  takeProfit: number; // 固定止盈线 0-100
  stopType: StopType; // 止损方式
  trailingStop: number; // 移动止损回撤比例 0-100
  atrStopMultiple: number; // ATR 止损倍数
  takeType: TakeType; // 止盈方式
  trailingTake: number; // 移动止盈回撤比例 0-100
  maxLossPerTrade: number; // 单笔最大亏损 0-100（0=不限）
  maxConsecutiveLosses: number; // 连续亏损熔断次数（0=不限）
}

/** 仓位层配置（仓位计算方式 + 上限 + 分批建仓/止盈，对齐 quant composite 引擎 position 结构） */
export interface StrategyPosition {
  sizing: PositionSizing; // 仓位计算方式
  baseSize: number; // 基础目标仓位 0-100
  maxSize: number; // 单票仓位硬上限 0-100
  totalCap: number; // 总仓位上限 0-100
  maxPositions: number; // 最大持仓数量（组合回测用，单标的恒为 1）
  kellyFraction: number; // 凯利分数系数 0-100（50=半凯利）
  atrPeriod: number; // ATR 周期
  atrRiskBudget: number; // ATR 单笔风险预算 0-100
  pyramiding: boolean; // 是否分批建仓（加仓）
  firstEntry: number; // 首仓比例 0-100（相对基础仓位）
  addOnProfit: number; // 加仓触发浮盈阈值 0-100
  addSize: number; // 每次加仓比例 0-100（相对基础仓位）
  maxAdds: number; // 最大加仓次数
  partialExit: boolean; // 是否分批止盈（减仓）
  partialExitRatio: number; // 首段止盈后保留比例 0-100（剩余继续持有）
}

/** 成本层配置（费率为万分比，最低佣金/固定滑点为元） */
export interface StrategyCost {
  commissionRate: number; // 佣金费率（万分比，3 = 万3 = 0.03%）
  stampTaxRate: number; // 印花税（万分比，10 = 千1 = 0.1%）
  transferFeeRate: number; // 过户费（万分比，0.1 = 万0.1）
  minCommission: number; // 最低佣金（元）
  slippageType: SlippageType; // 滑点方式
  slippageValue: number; // 滑点：percent 时万分比，fixed 时元
}

/** 策略配置 JSON（对齐 quant composite 引擎结构；entry/exit/risk/position 为历史数据兼容可选） */
export interface StrategyConfig {
  factors: StrategyFactor[];
  combine?: CombineMode;
  entry?: StrategyEntry;
  exit?: StrategyExit;
  risk?: StrategyRisk;
  position?: StrategyPosition;
  cost?: StrategyCost;
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
  stopLoss: number; // 固定止损线
  takeProfit: number; // 固定止盈线
  stopType: StopType; // 止损方式
  trailingStop: number; // 移动止损回撤比例 0-100
  atrStopMultiple: number; // ATR 止损倍数
  takeType: TakeType; // 止盈方式
  trailingTake: number; // 移动止盈回撤比例 0-100
  maxLossPerTrade: number; // 单笔最大亏损 0-100（0=不限）
  maxConsecutiveLosses: number; // 连续亏损熔断次数（0=不限）
}

/** 入场层配置输入（创建/编辑策略共用：入场方式 + 过滤开关） */
export interface StrategyEntryInput {
  entryType: EntryType; // 入场方式
  volumeConfirm: boolean; // 量能确认
  limitFilter: boolean; // 涨跌停过滤
  stFilter: boolean; // ST 过滤
  marketFilter: boolean; // 大盘过滤
}

/** 出场层配置输入（创建/编辑策略共用：出场方式 + 持仓时间上限） */
export interface StrategyExitInput {
  exitType: ExitType; // 出场方式
  maxHoldingDays: number; // 持仓时间上限（交易日，0=不限）
}

/** 仓位层配置输入（创建/编辑策略共用：计算方式 + 上限 + 分批建仓/止盈） */
export interface StrategyPositionInput {
  sizing: PositionSizing; // 仓位计算方式
  baseSize: number; // 基础目标仓位 0-100
  maxSize: number; // 单票仓位硬上限 0-100
  totalCap: number; // 总仓位上限 0-100
  maxPositions: number; // 最大持仓数量
  kellyFraction: number; // 凯利分数系数 0-100
  atrPeriod: number; // ATR 周期
  atrRiskBudget: number; // ATR 单笔风险预算 0-100
  pyramiding: boolean; // 是否分批建仓
  firstEntry: number; // 首仓比例 0-100
  addOnProfit: number; // 加仓触发浮盈阈值 0-100
  addSize: number; // 每次加仓比例 0-100
  maxAdds: number; // 最大加仓次数
  partialExit: boolean; // 是否分批止盈
  partialExitRatio: number; // 首段止盈后保留比例 0-100
}

/** 成本层配置输入（创建/编辑策略共用：费率为万分比，最低佣金/固定滑点为元） */
export interface StrategyCostInput {
  commissionRate: number; // 佣金费率（万分比）
  stampTaxRate: number; // 印花税（万分比）
  transferFeeRate: number; // 过户费（万分比）
  minCommission: number; // 最低佣金（元）
  slippageType: SlippageType; // 滑点方式
  slippageValue: number; // 滑点：percent 时万分比，fixed 时元
}

export interface CreateStrategyInput
  extends StrategyRiskInput,
    StrategyEntryInput,
    StrategyExitInput,
    StrategyPositionInput,
    StrategyCostInput {
  name: string;
  description: string;
  factors: StrategyFactor[];
  combine: CombineMode;
  isPublic: boolean;
}

export interface UpdateStrategyInput
  extends StrategyRiskInput,
    StrategyEntryInput,
    StrategyExitInput,
    StrategyPositionInput,
    StrategyCostInput {
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
          stopType: input.stopType,
          trailingStop: input.trailingStop,
          atrStopMultiple: input.atrStopMultiple,
          takeType: input.takeType,
          trailingTake: input.trailingTake,
          maxLossPerTrade: input.maxLossPerTrade,
          maxConsecutiveLosses: input.maxConsecutiveLosses,
          entryType: input.entryType,
          volumeConfirm: input.volumeConfirm,
          limitFilter: input.limitFilter,
          stFilter: input.stFilter,
          marketFilter: input.marketFilter,
          exitType: input.exitType,
          maxHoldingDays: input.maxHoldingDays,
          sizing: input.sizing,
          baseSize: input.baseSize,
          maxSize: input.maxSize,
          totalCap: input.totalCap,
          maxPositions: input.maxPositions,
          kellyFraction: input.kellyFraction,
          atrPeriod: input.atrPeriod,
          atrRiskBudget: input.atrRiskBudget,
          pyramiding: input.pyramiding,
          firstEntry: input.firstEntry,
          addOnProfit: input.addOnProfit,
          addSize: input.addSize,
          maxAdds: input.maxAdds,
          partialExit: input.partialExit,
          partialExitRatio: input.partialExitRatio,
          commissionRate: input.commissionRate,
          stampTaxRate: input.stampTaxRate,
          transferFeeRate: input.transferFeeRate,
          minCommission: input.minCommission,
          slippageType: input.slippageType,
          slippageValue: input.slippageValue,
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
