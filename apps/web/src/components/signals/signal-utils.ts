import type { SignalResult, SignalStatus } from "@ai-trader/signal-catalog/contracts";

export const SIGNAL_FILTERS = [
  { value: "all", label: "全部" },
  { value: "triggered", label: "已触发" },
  { value: "risk", label: "风险" },
  { value: "low-confidence", label: "低置信" },
  { value: "unavailable", label: "不可用" },
] as const;

export type SignalFilter = (typeof SIGNAL_FILTERS)[number]["value"];

const STATUS_META: Record<
  SignalStatus,
  { label: string; className: string; dotClassName: string }
> = {
  triggered: {
    label: "已触发",
    className: "border-app-success/25 bg-app-success/10 text-app-success",
    dotClassName: "bg-app-success",
  },
  neutral: {
    label: "中性",
    className: "border-app-line bg-app-surface text-app-muted",
    dotClassName: "bg-app-muted",
  },
  invalidated: {
    label: "已失效",
    className: "border-destructive/25 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
  "low-confidence": {
    label: "低置信",
    className: "border-app-warning/35 bg-app-warning/15 text-app-ink",
    dotClassName: "bg-app-warning",
  },
  unavailable: {
    label: "不可用",
    className: "border-app-line bg-app-panel text-app-muted",
    dotClassName: "bg-app-muted",
  },
  "not-applicable": {
    label: "不适用",
    className: "border-app-line bg-app-surface text-app-muted",
    dotClassName: "border border-app-line bg-transparent",
  },
};

export const signalStatusMeta = (status: SignalStatus) => STATUS_META[status];

export function filterSignals(
  signals: readonly SignalResult[],
  filter: SignalFilter,
): SignalResult[] {
  if (filter === "all") return [...signals];
  if (filter === "risk") {
    return signals.filter((signal) => signal.direction === "risk");
  }
  return signals.filter((signal) => signal.status === filter);
}

export const signalCounts = (signals: readonly SignalResult[]): Record<SignalStatus, number> =>
  Object.fromEntries(
    (
      [
        "triggered",
        "neutral",
        "invalidated",
        "low-confidence",
        "unavailable",
        "not-applicable",
      ] satisfies SignalStatus[]
    ).map((status) => [status, signals.filter((signal) => signal.status === status).length]),
  ) as Record<SignalStatus, number>;

export const formatSignalValue = (signal: SignalResult): string => {
  if (signal.value == null) return "—";
  if (typeof signal.value === "string") return signal.value;
  if (signal.unit === "percentile") return `${(signal.value * 100).toFixed(0)}%`;
  if (signal.unit === "ratio") {
    return `${signal.value >= 0 ? "+" : ""}${(signal.value * 100).toFixed(2)}%`;
  }
  if (Math.abs(signal.value) >= 1_000_000) {
    return `${(signal.value / 100_000_000).toFixed(2)} 亿`;
  }
  return signal.value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
  });
};

const LAYER_ORDER = [
  ["basic", "基础信号"],
  ["pattern", "K 线形态"],
  ["advanced", "高级模型"],
  ["micro", "微观结构"],
] as const;

export const groupSignalsByLayer = (
  signals: readonly SignalResult[],
  options: { includeMicro?: boolean } = {},
) =>
  LAYER_ORDER.filter(([layer]) => layer !== "micro" || options.includeMicro !== false)
    .map(([layer, label]) => ({
      key: layer,
      label,
      signals: signals.filter((signal) => signal.signalId.startsWith(`${layer}.`)),
    }))
    .filter((group) => group.signals.length > 0);

export const signalValidationMeta = (evidence: { winRate: number | null } | null) =>
  evidence == null
    ? {
        label: "待验证",
        winRate: null,
        detail: "尚未完成统一成本、持有期和样本外验证。",
      }
    : {
        label: "已验证",
        winRate: evidence.winRate,
        detail: "验证证据独立于当前实时信号状态。",
      };
