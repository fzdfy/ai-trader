import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  workflowRequest,
  type WorkflowDetail,
  type WorkflowGraph,
  type WorkflowRecord,
  type WorkflowRunDetail,
  type WorkflowRunSummary,
  type WorkflowSummary,
  type WorkflowVersion,
} from "../lib/workflows";

const ROOT_KEY = ["workflows"] as const;

export function useWorkflowsQuery() {
  return useQuery({
    queryKey: [...ROOT_KEY, "list"],
    queryFn: () => workflowRequest<{ items: WorkflowSummary[] }>("/api/v1/workflows"),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((workflow) =>
        ["pending", "running"].includes(workflow.latestRun?.status ?? ""),
      )
        ? 3000
        : false;
    },
  });
}

export function useWorkflowQuery(workflowId: number) {
  return useQuery({
    queryKey: [...ROOT_KEY, workflowId],
    queryFn: () => workflowRequest<WorkflowDetail>(`/api/v1/workflows/${workflowId}`),
    enabled: workflowId > 0,
  });
}

export function useWorkflowRunsQuery(workflowId?: number, limit = 20) {
  return useQuery({
    queryKey: [...ROOT_KEY, "runs", workflowId ?? "all", limit],
    queryFn: () =>
      workflowRequest<{ items: WorkflowRunSummary[] }>(
        workflowId
          ? `/api/v1/workflows/${workflowId}/runs?limit=${limit}`
          : `/api/v1/workflows/runs/today`,
      ),
    enabled: workflowId === undefined || workflowId > 0,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((run) => ["pending", "running"].includes(run.status)) ? 3000 : false;
    },
  });
}

export function useTodayWorkflowRunsQuery() {
  return useQuery({
    queryKey: [...ROOT_KEY, "today"],
    queryFn: () => workflowRequest<{ items: WorkflowRunSummary[] }>("/api/v1/workflows/runs/today"),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((run) => ["pending", "running"].includes(run.status)) ? 3000 : 30_000;
    },
  });
}

export function useWorkflowRunQuery(runId: number) {
  return useQuery({
    queryKey: [...ROOT_KEY, "run", runId],
    queryFn: () => workflowRequest<WorkflowRunDetail>(`/api/v1/workflows/runs/${runId}`),
    enabled: runId > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      return status && ["pending", "running"].includes(status) ? 2000 : false;
    },
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; description?: string } = {}) =>
      workflowRequest<WorkflowRecord>("/api/v1/workflows", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function useSaveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workflowId: number;
      name?: string;
      description?: string;
      draftGraph: WorkflowGraph;
    }) =>
      workflowRequest<WorkflowRecord>(`/api/v1/workflows/${input.workflowId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          draftGraph: input.draftGraph,
        }),
      }),
    onSuccess: (workflow) => {
      queryClient.setQueryData([...ROOT_KEY, workflow.id], (current: WorkflowDetail | undefined) =>
        current ? { ...current, ...workflow } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function usePublishWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: number) =>
      workflowRequest<{ version: WorkflowVersion }>(`/api/v1/workflows/${workflowId}/publish`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function useToggleWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workflowId: number; enabled: boolean }) =>
      workflowRequest<{ workflow: WorkflowRecord }>(
        `/api/v1/workflows/${input.workflowId}/enabled`,
        {
          method: "POST",
          body: JSON.stringify({ enabled: input.enabled }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function useArchiveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: number) =>
      workflowRequest<{ workflow: WorkflowRecord }>(`/api/v1/workflows/${workflowId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function useRunWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: number) =>
      workflowRequest<{
        runId: number;
        skipped: boolean;
        reason?: string;
      }>(`/api/v1/workflows/${workflowId}/run`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function useCancelWorkflowRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) =>
      workflowRequest<{ run: WorkflowRunSummary }>(`/api/v1/workflows/runs/${runId}/cancel`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}
