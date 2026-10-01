import { useQuery } from "@tanstack/react-query";

/** 数据表清单条目（GET /api/v1/data-center/tables） */
export interface DataTableSummary {
  /** 实际表名 */
  table: string;
  /** 中文名 */
  name: string;
  /** 描述 */
  description: string;
  /** 最近更新时间（ISO 字符串） */
  updatedAt: string | null;
}

/** 数据表字段（表结构 tab） */
export interface DataTableColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
  isPrimaryKey: boolean;
}

/** 数据表更新记录（更新记录 tab，对齐 job_run） */
export interface DataTableRecord {
  id: number;
  jobType: string;
  jobName: string;
  tradeDate: string | null;
  status: string;
  total: number | null;
  processed: number | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

/** 上游真实接口：数据最终从哪个外部 HTTP 接口取得（含完整 URL 与请求方式） */
export interface UpstreamEndpoint {
  /** HTTP 请求方式 */
  method: "GET" | "POST";
  /** 完整上游 URL（协议 + 主机 + 路径） */
  url: string;
  /** 该接口取用的数据用途（同源多接口时用于区分） */
  target?: string;
}

/** 数据来源条目（数据来源 tab） */
export interface DataSourceMeta {
  /** 上游平台 / 提供方 */
  platform: string;
  /** 调用链 / 取数方法：如 quant.stockKline；本地派生则为派生说明 */
  endpoint: string;
  /** 上游真实 HTTP 接口列表；本地派生 / 无外部 HTTP 源时缺省。有值时展示为 `endpoint → METHOD url` */
  upstream?: UpstreamEndpoint[];
  /** 复权口径 / 覆盖范围 / 备注 */
  note?: string;
}

/** 同步策略（数据同步 tab · 同步策略块） */
export interface SyncPolicyMeta {
  trigger: string;
  cron: string | null;
  dependsOn: string | null;
  deadline: string | null;
  note?: string;
}

/** 回补（数据同步 tab · 回补块） */
export interface BackfillMeta {
  separate: boolean;
  trigger: string | null;
  cron: string | null;
  note: string;
}

/** 降级链（数据同步 tab · 降级块） */
export interface FallbackMeta {
  capability: string;
  /** 有序降级链，首项为主源；空数组表示无降级链 */
  chain: string[];
  degrade: boolean;
  note?: string;
}

/** 单表详情（GET /api/v1/data-center/tables/:table） */
export interface DataTableDetail {
  table: string;
  name: string;
  description: string;
  updatedAt: string | null;
  sources: DataSourceMeta[];
  syncPolicy: SyncPolicyMeta;
  backfill: BackfillMeta;
  fallback: FallbackMeta;
  riskControl: string[];
  columns: DataTableColumn[];
  records: DataTableRecord[];
}

/** 单个数据源的熔断 / 限流运行时快照（GET /api/v1/data-center/sources/health；当前仅东财有） */
export interface ProviderBreakerStatus {
  /** 是否处于熔断（冷却期内该源请求直接失败，交由降级链兜底） */
  tripped: boolean;
  /** 当前连续失败计数 */
  fail_streak: number;
  /** 触发熔断的连续失败阈值 */
  threshold: number;
  /** 熔断冷却时长（秒） */
  cooldown_sec: number;
  /** 冷却剩余时长（秒），未熔断为 0 */
  cooldown_remaining_sec: number;
  /** 该源两次请求最小间隔（秒） */
  min_interval_sec: number;
  /** 已登记的 WAF 绕过 URL 数 */
  bypass_url_count: number;
}

/** 单个数据源运行态（GET /api/v1/data-center/sources/health） */
export interface ProviderHealth {
  name: string;
  /** 熔断快照；为 null 表示该源无健康遥测（当前仅东财实现熔断） */
  breaker: ProviderBreakerStatus | null;
}

/** 单个能力降级链运行态（GET /api/v1/data-center/sources/health） */
export interface CapabilityHealth {
  /** 能力名（如 kline / board_kline） */
  capability: string;
  /** 降级链（源名有序，主源在前） */
  chain: string[];
  /** 链首主源 */
  primary: string | null;
  /** 当前生效源：链中首个「健康」的源；全部不可用为 null */
  active_source: string | null;
  /** 是否已从主源降级（active_source 非链首） */
  degraded: boolean;
  /** 链中是否仍有可用源 */
  available: boolean;
}

/** 数据源健康 / 降级链运行态快照（GET /api/v1/data-center/sources/health） */
export interface DataSourcesHealth {
  providers: ProviderHealth[];
  capabilities: CapabilityHealth[];
}

/** 数据中心表清单（GET /api/v1/data-center/tables） */
export function useDataCenterTables() {
  return useQuery({
    queryKey: ["data-center", "tables"],
    queryFn: async () => {
      const res = await fetch("/api/v1/data-center/tables");
      const json = await res.json();
      return (json.success ? json.data : { tables: [] }) as { tables: DataTableSummary[] };
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** 单表详情（GET /api/v1/data-center/tables/:table） */
export function useDataCenterTable(table: string) {
  return useQuery({
    queryKey: ["data-center", "tables", table],
    enabled: Boolean(table),
    queryFn: async () => {
      const res = await fetch(`/api/v1/data-center/tables/${encodeURIComponent(table)}`);
      const json = await res.json();
      return (json.success ? json.data : null) as DataTableDetail | null;
    },
  });
}

/** 数据源健康 / 降级链运行态（GET /api/v1/data-center/sources/health；运行时观测，定时刷新） */
export function useDataSourcesHealth(enabled = true) {
  return useQuery({
    queryKey: ["data-center", "sources-health"],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/v1/data-center/sources/health");
      const json = await res.json();
      return (json.success ? json.data : null) as DataSourcesHealth | null;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
