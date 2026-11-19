import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CapabilityHealth,
  DataSourceMeta,
  ProviderHealth,
} from "./useDataCenter";

export type SourceCatalogItem = DataSourceMeta & {
  id: string;
  table: string;
  tableName: string;
  capability: string;
  fallbackChain: string[];
  degrade: boolean;
  riskControl: string[];
  provider: ProviderHealth | null;
};

export type SourceCatalog = {
  observedAt: string;
  healthError: string | null;
  sources: SourceCatalogItem[];
  capabilities: CapabilityHealth[];
};

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

export type AdminAuditRecord = {
  id: number;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  action:
    | "sync_run"
    | "sync_retry"
    | "governance_task_start"
    | "governance_task_complete"
    | "governance_task_cancel"
    | "governance_incident_acknowledge"
    | "governance_incident_resolve";
  targetJobType: string | null;
  reason: string | null;
  requestId: string;
  jobRunId: number | null;
  status: "accepted" | "running" | "success" | "failed" | "interrupted";
  inputJson: unknown;
  resultJson: unknown;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

async function readData<T>(response: Response, fallback: T): Promise<T> {
  const payload = (await response.json()) as {
    success?: boolean;
    data?: T;
    error?: string;
    message?: string;
  };
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? payload.message ?? "请求失败");
  }
  return payload.data ?? fallback;
}

export function useSourceCatalog() {
  return useQuery({
    queryKey: ["data-management", "sources"],
    queryFn: async ({ signal }) =>
      readData<SourceCatalog>(
        await fetch("/api/v1/data-management/sources", { signal }),
        {
          observedAt: new Date().toISOString(),
          healthError: null,
          sources: [],
          capabilities: [],
        },
      ),
    refetchInterval: 30_000,
  });
}

export function useDataQuality() {
  return useQuery({
    queryKey: ["data-management", "quality"],
    queryFn: async ({ signal }) =>
      readData<QualitySummary>(
        await fetch("/api/v1/data-management/quality", { signal }),
        {
          status: "warning",
          tables: [],
          gaps: [],
          providers: [],
          counts: {
            totalTables: 0,
            healthyTables: 0,
            staleTables: 0,
            missingTables: 0,
            unresolvedGaps: 0,
            degradedProviders: 0,
            failedJobs: 0,
          },
        },
      ),
    refetchInterval: 30_000,
  });
}

export function useAdminAudit(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ["data-management", "audit", page, pageSize],
    queryFn: async ({ signal }) =>
      readData<{
        total: number;
        page: number;
        pageSize: number;
        items: AdminAuditRecord[];
      }>(
        await fetch(
          `/api/v1/data-management/audit?page=${page}&pageSize=${pageSize}`,
          { signal },
        ),
        { total: 0, page, pageSize, items: [] },
      ),
  });
}

export function useRetrySyncModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobType,
      reason,
    }: {
      jobType: string;
      reason: string;
    }) => {
      const response = await fetch(
        `/api/v1/data-management/sync/modules/${encodeURIComponent(jobType)}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      return readData(await response, { accepted: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync", "modules"] });
      queryClient.invalidateQueries({ queryKey: ["sync", "records"] });
      queryClient.invalidateQueries({ queryKey: ["system", "data-status"] });
      queryClient.invalidateQueries({ queryKey: ["data-management", "audit"] });
      queryClient.invalidateQueries({ queryKey: ["data-management", "quality"] });
    },
  });
}

