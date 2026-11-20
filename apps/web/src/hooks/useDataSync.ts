import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** 普通用户可见的聚合数据状态（GET /api/v1/system/data-status） */
export function useLastUpdated() {
  return useQuery({
    queryKey: ["system", "data-status"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/v1/system/data-status", { signal });
      const json = await res.json();
      return (json.success ? json.data : null) as { updatedAt: string | null } | null;
    },
  });
}

/**
 * 手动触发核心行情同步（POST /api/v1/data-management/sync/run）。
 * 接口异步触发：请求立即返回，任务后台执行；触发后刷新模块进度（由轮询展示进度与最终状态）。
 */
export function useRunSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch("/api/v1/data-management/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? json.message ?? "同步失败");
      return json.data as { accepted: boolean; runId: number | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync", "modules"] });
      queryClient.invalidateQueries({ queryKey: ["system", "data-status"] });
      queryClient.invalidateQueries({ queryKey: ["data-management", "audit"] });
    },
  });
}

/** 轮询聚合同步状态（GET /api/v1/system/data-status）。 */
export function useSyncStatus() {
  return useQuery({
    queryKey: ["system", "data-status"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/v1/system/data-status", { signal });
      const json = await res.json();
      return (json.success ? json.data : { running: false }) as {
        running: boolean;
      };
    },
    refetchInterval: 3000,
  });
}

/** 同步模块中文名映射（与后端 SYNC_MODULES 对齐） */
export const SYNC_MODULE_NAMES: Record<string, string> = {
  "kline-1m": "分钟 K 线",
  "kline-1d": "日 K 线",
  "gap-detect": "缺口检测",
  news: "新闻",
  boards: "板块排行",
  "board-kline": "板块指数 K 线",
  constituents: "板块成分股",
  fundflow: "资金流排行",
  "limit-up-pool": "涨停池",
  "board-fund-flow": "板块资金流",
  "dragon-tiger": "龙虎榜",
  "hot-reason": "题材归因",
  "kline-period": "周期 K 线",
  features: "特征计算",
  "adj-factor": "复权因子",
  "limit-up-pool-backfill": "涨停池回补",
  "dragon-tiger-backfill": "龙虎榜回补",
  "hot-reason-backfill": "题材归因回补",
  "sync-manual": "手动同步",
};

/** 模块名（未知 jobType 直接显示原始值） */
export function moduleName(jobType: string): string {
  return SYNC_MODULE_NAMES[jobType] ?? jobType;
}

export interface SyncModuleStatus {
  jobType: string;
  name: string;
  dependsOn: string | null;
  status: "running" | "success" | "failed" | "never";
  total: number | null;
  processed: number | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  lastSuccessAt: string | null;
  todaySuccess: number;
  todayFailed: number;
}

/**
 * 各模块同步状态汇总（GET /api/v1/data-management/sync/modules）。
 * 运行中进度会变化，3s 轮询。
 */
export function useSyncModules(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["sync", "modules"],
    queryFn: async () => {
      const res = await fetch("/api/v1/data-management/sync/modules");
      const json = await res.json();
      return (json.success ? json.data : { modules: [], lastSuccessAt: null }) as {
        modules: SyncModuleStatus[];
        lastSuccessAt: string | null;
      };
    },
    refetchInterval: 3000,
    enabled: options.enabled ?? true,
  });
}

export interface SyncRecord {
  id: number;
  jobType: string;
  status: string;
  total: number | null;
  processed: number | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  [key: string]: unknown;
}

/**
 * 同步记录分页查询（GET /api/v1/data-management/sync/records）。
 */
export function useSyncRecords(
  page: number,
  pageSize = 20,
  jobType?: string,
  status?: string,
) {
  return useQuery({
    queryKey: ["sync", "records", page, pageSize, jobType ?? "all", status ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (jobType) params.set("jobType", jobType);
      if (status) params.set("status", status);
      const res = await fetch(`/api/v1/data-management/sync/records?${params.toString()}`);
      const json = await res.json();
      return (json.success ? json.data : { total: 0, items: [] }) as {
        total: number;
        page: number;
        pageSize: number;
        items: SyncRecord[];
      };
    },
  });
}
