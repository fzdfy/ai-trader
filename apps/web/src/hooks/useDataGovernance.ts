import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type GovernanceTier = "tier_0" | "tier_1" | "tier_2";

export type GovernanceAsset = {
  key: string;
  name: string;
  kind: string;
  domain: string;
  tier: GovernanceTier;
  responsibilities: {
    owner: { name: string; role?: string; contact?: string };
    steward: { name: string; role?: string; contact?: string };
    operator: { name: string; role?: string; contact?: string };
  };
  classification: "internal" | "restricted";
  retention: {
    mode: "permanent" | "duration" | "rebuildable";
    durationDays?: number;
    note: string;
  };
  contract: {
    businessDefinition: string;
    grain: string;
    primaryKey: string[];
    eventTimeField: string;
    knownAtField?: string;
    freshnessSlaHours: number;
    allowedConsumers: string[];
  };
  sourceStandardRefs: string[];
  lineage: {
    upstreamAssets: string[];
    downstreamAssets: string[];
    jobTypes: string[];
  };
};

export type QualityRule = {
  id: string;
  version: number;
  assetKey: string;
  dimension: string;
  severity: "warning" | "critical";
  triggerJobTypes: string[];
  checkKey: string;
  params: Record<string, unknown>;
};

export type QualityEvidence = {
  id: number;
  assetKey: string;
  ruleId: string;
  ruleVersion: number;
  status: "passed" | "warning" | "failed" | "error";
  severity: "warning" | "critical";
  jobRunId: number | null;
  requestId: string | null;
  observedValue: string | null;
  detailsJson: Record<string, unknown>;
  checkedAt: string;
};

export type GovernanceTask = {
  id: number;
  taskType: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "canceled";
  priority: "normal" | "high" | "critical";
  ownerRole: string;
  relatedType: string | null;
  relatedId: string | null;
  payloadJson: Record<string, unknown>;
  resultJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type DataIncident = {
  id: number;
  assetKey: string | null;
  incidentType: string;
  severity: "warning" | "critical";
  status: "open" | "acknowledged" | "resolving" | "resolved" | "closed";
  title: string;
  description: string;
  rootCause: string | null;
  payloadJson: Record<string, unknown>;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};

export type GovernanceSourceStandard = {
  id: "a-stock-data";
  repository: string;
  commitSha: string;
  versionLabel: string;
  skillFileSha256: string;
  reviewedAt: string;
  capabilities: string[];
  snapshotPath: string;
  latestTask: GovernanceTask | null;
};

type GovernanceOverview = {
  counts: {
    assets: number;
    tier0: number;
    rules: number;
    activeIncidents: number;
    pendingTasks: number;
  };
  qualityResults: QualityEvidence[];
  workTasks: GovernanceTask[];
  incidents: DataIncident[];
  sourceStandards: GovernanceSourceStandard[];
  gateMode?: "off" | "warn" | "enforce";
};

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error ?? "请求失败");
  }
  return payload.data;
}

const governanceRoot = ["data-management", "governance"] as const;

export function useGovernanceOverview() {
  return useQuery({
    queryKey: [...governanceRoot, "overview"],
    queryFn: async ({ signal }) =>
      readData<GovernanceOverview>(
        await fetch("/api/v1/data-management/governance/overview", { signal }),
      ),
    refetchInterval: 30_000,
  });
}

export function useGovernanceAssets() {
  return useQuery({
    queryKey: [...governanceRoot, "assets"],
    queryFn: async ({ signal }) => {
      const data = await readData<{ items: GovernanceAsset[] }>(
        await fetch("/api/v1/data-management/governance/assets", { signal }),
      );
      return data.items;
    },
    staleTime: 5 * 60_000,
  });
}

export function useGovernanceAsset(assetKey: string | null) {
  return useQuery({
    queryKey: [...governanceRoot, "asset", assetKey],
    queryFn: async ({ signal }) =>
      readData<{
        asset: GovernanceAsset;
        qualityResults: QualityEvidence[];
        incidents: DataIncident[];
        workTasks: GovernanceTask[];
      }>(
        await fetch(
          `/api/v1/data-management/governance/assets/${encodeURIComponent(assetKey!)}`,
          { signal },
        ),
      ),
    enabled: Boolean(assetKey),
  });
}

export function useQualityEvidence(filter: { assetKey?: string; status?: string } = {}) {
  const search = new URLSearchParams();
  if (filter.assetKey) search.set("assetKey", filter.assetKey);
  if (filter.status) search.set("status", filter.status);
  return useQuery({
    queryKey: [...governanceRoot, "quality", filter.assetKey ?? "", filter.status ?? ""],
    queryFn: async ({ signal }) => {
      const data = await readData<{ items: QualityEvidence[] }>(
        await fetch(
          `/api/v1/data-management/governance/quality/results?${search}`,
          { signal },
        ),
      );
      return data.items;
    },
    refetchInterval: 30_000,
  });
}

export function useQualityRules() {
  return useQuery({
    queryKey: [...governanceRoot, "quality-rules"],
    queryFn: async ({ signal }) => {
      const data = await readData<{ items: QualityRule[] }>(
        await fetch("/api/v1/data-management/governance/quality/rules", {
          signal,
        }),
      );
      return data.items;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSourceStandardStatus() {
  return useQuery({
    queryKey: [...governanceRoot, "source-standards"],
    queryFn: async ({ signal }) =>
      readData<{
        items: GovernanceSourceStandard[];
        gateMode: "off" | "warn" | "enforce";
      }>(
        await fetch("/api/v1/data-management/governance/source-standards", {
          signal,
        }),
      ),
    refetchInterval: 60_000,
  });
}

export function useGovernanceTasks(filter: { status?: string } = {}) {
  const search = new URLSearchParams();
  if (filter.status) search.set("status", filter.status);
  return useQuery({
    queryKey: [...governanceRoot, "tasks", filter.status ?? ""],
    queryFn: async ({ signal }) => {
      const data = await readData<{ items: GovernanceTask[] }>(
        await fetch(
          `/api/v1/data-management/governance/review-tasks?${search}`,
          { signal },
        ),
      );
      return data.items;
    },
  });
}

export function useGovernanceTask(id: number | null) {
  return useQuery({
    queryKey: [...governanceRoot, "task", id],
    queryFn: async ({ signal }) =>
      readData<GovernanceTask & { events: Array<Record<string, unknown>> }>(
        await fetch(
          `/api/v1/data-management/governance/review-tasks/${id}`,
          { signal },
        ),
      ),
    enabled: Boolean(id),
  });
}

export function useDataIncidents(filter: { status?: string } = {}) {
  const search = new URLSearchParams();
  if (filter.status) search.set("status", filter.status);
  return useQuery({
    queryKey: [...governanceRoot, "incidents", filter.status ?? ""],
    queryFn: async ({ signal }) => {
      const data = await readData<{ items: DataIncident[] }>(
        await fetch(
          `/api/v1/data-management/governance/incidents?${search}`,
          { signal },
        ),
      );
      return data.items;
    },
    refetchInterval: 30_000,
  });
}

export function useDataIncident(id: number | null) {
  return useQuery({
    queryKey: [...governanceRoot, "incident", id],
    queryFn: async ({ signal }) =>
      readData<{
        incident: DataIncident;
        events: Array<{
          id: number;
          eventType: string;
          message: string | null;
          actorUserId: string | null;
          createdAt: string;
        }>;
      }>(
        await fetch(
          `/api/v1/data-management/governance/incidents/${id}`,
          { signal },
        ),
      ),
    enabled: Boolean(id),
  });
}

async function mutateGovernance(
  path: string,
  input: { reason: string; result?: Record<string, unknown>; rootCause?: string },
) {
  return readData<unknown>(
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

function useGovernanceMutation(
  resource: "review-tasks" | "incidents",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: number;
      action: string;
      reason: string;
      result?: Record<string, unknown>;
      rootCause?: string;
    }) =>
      mutateGovernance(
        `/api/v1/data-management/governance/${resource}/${input.id}/${input.action}`,
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: governanceRoot });
      void queryClient.invalidateQueries({ queryKey: ["data-management", "audit"] });
    },
  });
}

export function useTransitionGovernanceTask() {
  return useGovernanceMutation("review-tasks");
}

export function useTransitionIncident() {
  return useGovernanceMutation("incidents");
}
