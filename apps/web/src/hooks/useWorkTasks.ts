import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BoardStatus,
  UserWorkTask,
  WorkTaskCategory,
  WorkTaskDetail,
  WorkTaskPriority,
  WorkTaskSourceType,
  WorkTaskSummary,
  WorkTaskView,
} from "../lib/work-tasks";

type ApiPayload<T> = {
  success?: boolean;
  data?: T;
  error?: string;
};

async function readData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiPayload<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error ?? "工作任务请求失败");
  }
  return payload.data;
}

const ROOT = ["work-tasks"] as const;

export type CreateWorkTaskInput = {
  title: string;
  description?: string | null;
  category: WorkTaskCategory;
  priority: WorkTaskPriority;
  scheduledDate?: string | null;
  dueTime?: string | null;
  blockedReason?: string | null;
  sourceType?: WorkTaskSourceType;
  sourceId?: string;
};

export type PatchWorkTaskInput = Partial<
  Pick<
    CreateWorkTaskInput,
    | "title"
    | "description"
    | "category"
    | "priority"
    | "scheduledDate"
    | "dueTime"
    | "blockedReason"
  >
> & { completionNote?: string | null };

export function useWorkTaskSummary(localDate: string, timezone: string) {
  const search = new URLSearchParams({ localDate, timezone });
  return useQuery({
    queryKey: [...ROOT, "summary", localDate, timezone],
    queryFn: async ({ signal }) =>
      readData<WorkTaskSummary>(
        await fetch(`/api/v1/work-tasks/summary?${search}`, { signal }),
      ),
    staleTime: 15_000,
  });
}

export function useWorkTasks(
  view: WorkTaskView,
  localDate: string,
  timezone: string,
) {
  const search = new URLSearchParams({ view, localDate, timezone });
  return useQuery({
    queryKey: [...ROOT, "list", view, localDate, timezone],
    queryFn: async ({ signal }) =>
      readData<{ items: UserWorkTask[]; nextCursor: number | null }>(
        await fetch(`/api/v1/work-tasks?${search}`, { signal }),
      ),
    placeholderData: (previous) => previous,
  });
}

export function useWorkTaskDetail(id: number | null) {
  return useQuery({
    queryKey: [...ROOT, "detail", id],
    queryFn: async ({ signal }) =>
      readData<WorkTaskDetail>(
        await fetch(`/api/v1/work-tasks/${id}`, { signal }),
      ),
    enabled: Boolean(id),
  });
}

function useInvalidateWorkTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ROOT });
}

export function useCreateWorkTask() {
  const invalidate = useInvalidateWorkTasks();
  return useMutation({
    mutationFn: async (input: CreateWorkTaskInput) =>
      readData<{ id: number; sourceResolved: boolean }>(
        await fetch("/api/v1/work-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: invalidate,
  });
}

export function usePatchWorkTask() {
  const invalidate = useInvalidateWorkTasks();
  return useMutation({
    mutationFn: async (input: { id: number; patch: PatchWorkTaskInput }) =>
      readData<{ id: number }>(
        await fetch(`/api/v1/work-tasks/${input.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.patch),
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useTransitionWorkTask() {
  const invalidate = useInvalidateWorkTasks();
  return useMutation({
    mutationFn: async (input: {
      id: number;
      action: "start" | "complete" | "reopen" | "cancel" | "restore";
      message?: string | null;
      completionNote?: string | null;
    }) =>
      readData<{ id: number }>(
        await fetch(`/api/v1/work-tasks/${input.id}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: input.action,
            message: input.message,
            completionNote: input.completionNote,
          }),
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useMoveWorkTask() {
  const invalidate = useInvalidateWorkTasks();
  return useMutation({
    mutationFn: async (input: {
      id: number;
      targetStatus: BoardStatus;
      beforeId?: number;
      afterId?: number;
    }) =>
      readData<{ id: number }>(
        await fetch(`/api/v1/work-tasks/${input.id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetStatus: input.targetStatus,
            beforeId: input.beforeId,
            afterId: input.afterId,
          }),
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useResetWorkTaskOrder() {
  const invalidate = useInvalidateWorkTasks();
  return useMutation({
    mutationFn: async (status: BoardStatus) =>
      readData<{ status: BoardStatus }>(
        await fetch("/api/v1/work-tasks/order/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }),
      ),
    onSuccess: invalidate,
  });
}
