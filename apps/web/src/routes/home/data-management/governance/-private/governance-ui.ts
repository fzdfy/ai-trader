export type GovernanceTone = "success" | "warning" | "error" | "neutral" | "blue";

export function formatGovernanceDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function qualityStatusMeta(status: string): {
  label: string;
  tone: GovernanceTone;
} {
  return {
    passed: { label: "通过", tone: "success" as const },
    warning: { label: "警告", tone: "warning" as const },
    failed: { label: "失败", tone: "error" as const },
    error: { label: "执行错误", tone: "error" as const },
  }[status] ?? { label: status, tone: "neutral" as const };
}

export function taskStatusMeta(status: string): {
  label: string;
  tone: GovernanceTone;
} {
  return {
    pending: { label: "待处理", tone: "warning" as const },
    in_progress: { label: "处理中", tone: "blue" as const },
    completed: { label: "已完成", tone: "success" as const },
    canceled: { label: "已取消", tone: "neutral" as const },
  }[status] ?? { label: status, tone: "neutral" as const };
}

export function incidentStatusMeta(status: string): {
  label: string;
  tone: GovernanceTone;
} {
  return {
    open: { label: "待确认", tone: "warning" as const },
    acknowledged: { label: "已确认", tone: "blue" as const },
    resolving: { label: "处理中", tone: "blue" as const },
    resolved: { label: "已解决", tone: "success" as const },
    closed: { label: "已关闭", tone: "neutral" as const },
  }[status] ?? { label: status, tone: "neutral" as const };
}

export const TIER_LABELS = {
  tier_0: "Tier 0",
  tier_1: "Tier 1",
  tier_2: "Tier 2",
} as const;

export const DOMAIN_LABELS: Record<string, string> = {
  reference: "参考数据",
  market_raw: "市场原始",
  market_intelligence: "市场情报",
  research_derived: "研究派生",
  application: "应用数据",
};

export const DIMENSION_LABELS: Record<string, string> = {
  freshness: "新鲜度",
  completeness: "完整性",
  uniqueness: "唯一性",
  validity: "有效性",
  coverage: "覆盖率",
  consistency: "一致性",
  pit: "时点正确性",
};

export function readinessLabel(mode: string | undefined): string {
  return mode === "enforce"
    ? "阻断已启用"
    : mode === "off"
      ? "门禁已关闭"
      : "观测模式";
}
