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

/** 单表详情（GET /api/v1/data-center/tables/:table） */
export interface DataTableDetail {
  table: string;
  name: string;
  description: string;
  updatedAt: string | null;
  columns: DataTableColumn[];
  records: DataTableRecord[];
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
