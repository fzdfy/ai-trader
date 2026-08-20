import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** 最近数据更新时间（GET /api/v1/sync/last-updated） */
export function useLastUpdated() {
  return useQuery({
    queryKey: ["sync", "last-updated"],
    queryFn: async () => {
      const res = await fetch("/api/v1/sync/last-updated");
      const json = await res.json();
      return (json.success ? json.data : null) as { updatedAt: string | null } | null;
    },
  });
}

/** 手动触发核心行情同步（POST /api/v1/sync/run），成功后刷新更新时间 */
export function useRunSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/sync/run", { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "同步失败");
      return json.data as { updatedAt: string | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync", "last-updated"] });
    },
  });
}

/** 轮询同步状态（GET /api/v1/sync/status），用于展示定时/手动任务的「自动更新中」 */
export function useSyncStatus() {
  return useQuery({
    queryKey: ["sync", "status"],
    queryFn: async () => {
      const res = await fetch("/api/v1/sync/status");
      const json = await res.json();
      return (json.success ? json.data : { runningJobs: [] }) as {
        runningJobs: string[];
      };
    },
    refetchInterval: 3000,
  });
}
