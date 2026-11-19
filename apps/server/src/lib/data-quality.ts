export type QualitySummary = {
  status: "healthy" | "warning" | "critical";
  tables: Array<{
    table: string;
    name: string;
    updatedAt: string | null;
    status: "healthy" | "warning" | "missing";
    reason: string | null;
  }>;
  gaps: Array<{
    id: number;
    symbol: string;
    timeframe: string;
    missingStart: string;
    missingEnd: string;
    detectedAt: string;
  }>;
  providers: Array<{
    name: string;
    tripped: boolean;
    status: "healthy" | "critical";
  }>;
  counts: {
    totalTables: number;
    healthyTables: number;
    staleTables: number;
    missingTables: number;
    unresolvedGaps: number;
    degradedProviders: number;
    failedJobs: number;
  };
};

export function buildQualitySummary(input: {
  now: string;
  tables: Array<{
    table: string;
    name: string;
    updatedAt: string | null;
    staleAfterHours: number | null;
  }>;
  gaps: QualitySummary["gaps"];
  providers: Array<{ name: string; tripped: boolean }>;
  failedJobs?: number;
  unresolvedGapCount?: number;
}): QualitySummary {
  const nowMs = new Date(input.now).getTime();
  const tables = input.tables.map((table) => {
    if (!table.updatedAt) {
      return {
        table: table.table,
        name: table.name,
        updatedAt: null,
        status: "missing" as const,
        reason: "暂无数据",
      };
    }

    const updatedMs = new Date(table.updatedAt).getTime();
    if (Number.isNaN(updatedMs)) {
      return {
        table: table.table,
        name: table.name,
        updatedAt: table.updatedAt,
        status: "missing" as const,
        reason: "更新时间无效",
      };
    }

    const stale =
      table.staleAfterHours != null &&
      nowMs - updatedMs > table.staleAfterHours * 60 * 60 * 1000;
    return {
      table: table.table,
      name: table.name,
      updatedAt: table.updatedAt,
      status: stale ? ("warning" as const) : ("healthy" as const),
      reason: stale ? `超过 ${table.staleAfterHours} 小时未更新` : null,
    };
  });
  const providers = input.providers.map((provider) => ({
    ...provider,
    status: provider.tripped ? ("critical" as const) : ("healthy" as const),
  }));
  const failedJobs = input.failedJobs ?? 0;
  const counts = {
    totalTables: tables.length,
    healthyTables: tables.filter((table) => table.status === "healthy").length,
    staleTables: tables.filter((table) => table.status === "warning").length,
    missingTables: tables.filter((table) => table.status === "missing").length,
    unresolvedGaps: input.unresolvedGapCount ?? input.gaps.length,
    degradedProviders: providers.filter((provider) => provider.tripped).length,
    failedJobs,
  };

  return {
    status:
      counts.degradedProviders > 0 || failedJobs > 0
        ? "critical"
        : counts.staleTables > 0 ||
            counts.missingTables > 0 ||
            counts.unresolvedGaps > 0
          ? "warning"
          : "healthy",
    tables,
    gaps: input.gaps,
    providers,
    counts,
  };
}
