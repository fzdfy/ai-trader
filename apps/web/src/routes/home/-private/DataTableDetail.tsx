/**
 * 数据中心 — 单表详情。
 *
 * 展示「中文名 + 实际表名 + 描述 + 更新时间」，并以下方标签页切换：
 *   - 表结构：该表的字段清单（名称 / 类型 / 主键 / 可空 / 默认值）
 *   - 更新记录：写入该表的同步任务执行历史（来自 job_run）
 * 数据源：GET /api/v1/data-center/tables/:table
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Table, proportional } from "@astryxdesign/core/Table";
import {
  useDataCenterTable,
  type DataTableColumn,
  type DataTableRecord,
} from "../../../hooks/useDataCenter";

type TabValue = "schema" | "records";

type ColumnRow = DataTableColumn & Record<string, unknown>;
type RecordRow = DataTableRecord & Record<string, unknown>;

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 时间 → YYYY-MM-DD HH:mm:ss */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 耗时格式化（毫秒 → 中文可读） */
function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m} 分 ${r} 秒` : `${m} 分`;
}

/** 任务状态 → 展示元信息（点色 / 文案） */
const STATUS_META: Record<
  string,
  { variant: "success" | "error" | "accent" | "neutral"; label: string }
> = {
  running: { variant: "accent", label: "运行中" },
  success: { variant: "success", label: "成功" },
  failed: { variant: "error", label: "失败" },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { variant: "neutral" as const, label: status };
}

/** 表结构列定义 */
const COLUMN_DEFS = [
  {
    key: "name" as const,
    header: "字段名",
    width: proportional(2),
    renderCell: (row: ColumnRow) => (
      <HStack gap={2} align="center">
        <Text type="code" size="sm">
          {row.name}
        </Text>
        {row.isPrimaryKey ? <Badge label="主键" variant="neutral" /> : null}
      </HStack>
    ),
  },
  { key: "dataType" as const, header: "类型", width: proportional(1.5) },
  {
    key: "isNullable" as const,
    header: "可空",
    width: proportional(0.8),
    renderCell: (row: ColumnRow) => <Text size="sm">{row.isNullable ? "是" : "否"}</Text>,
  },
  {
    key: "columnDefault" as const,
    header: "默认值",
    width: proportional(2),
    renderCell: (row: ColumnRow) => (
      <Text type="code" size="sm">
        {row.columnDefault ?? "-"}
      </Text>
    ),
  },
];

/** 更新记录列定义（对齐同步中心记录表） */
const RECORD_DEFS = [
  {
    key: "jobName" as const,
    header: "模块",
    width: proportional(1.2),
    renderCell: (row: RecordRow) => (
      <Text weight="medium" size="sm">
        {row.jobName}
      </Text>
    ),
  },
  {
    key: "status" as const,
    header: "状态",
    width: proportional(0.8),
    renderCell: (row: RecordRow) => {
      const meta = statusMeta(row.status);
      return (
        <HStack gap={2} align="center">
          <StatusDot variant={meta.variant} label={meta.label} isPulsing={row.status === "running"} />
          <Text size="sm">{meta.label}</Text>
        </HStack>
      );
    },
  },
  {
    key: "tradeDate" as const,
    header: "交易日",
    width: proportional(1),
    renderCell: (row: RecordRow) => <Text size="sm">{row.tradeDate ?? "-"}</Text>,
  },
  {
    key: "progress" as const,
    header: "已同步",
    width: proportional(1),
    renderCell: (row: RecordRow) =>
      row.processed != null && row.total != null ? (
        <Text size="sm">
          {row.processed}/{row.total}
        </Text>
      ) : (
        <Text size="sm" type="supporting">
          -
        </Text>
      ),
  },
  {
    key: "startedAt" as const,
    header: "开始时间",
    width: proportional(1.6),
    renderCell: (row: RecordRow) => <Text size="sm">{formatDateTime(row.startedAt)}</Text>,
  },
  {
    key: "durationMs" as const,
    header: "耗时",
    width: proportional(0.8),
    renderCell: (row: RecordRow) => (
      <Text size="sm" type="supporting">
        {formatDuration(row.durationMs)}
      </Text>
    ),
  },
  {
    key: "message" as const,
    header: "消息",
    width: proportional(2.4),
    renderCell: (row: RecordRow) => (
      <Text size="sm" type="supporting" wordBreak="break-all">
        {row.error ?? row.message ?? "-"}
      </Text>
    ),
  },
];

/** 单表详情主体 */
export function DataTableDetailView({ table }: { table: string }) {
  const [tab, setTab] = useState<TabValue>("schema");
  const { data, isLoading } = useDataCenterTable(table);

  if (isLoading && !data) {
    return <Spinner size="sm" label="加载表详情中..." />;
  }

  if (!data) {
    return <Text type="supporting">未找到该数据表</Text>;
  }

  const columns: ColumnRow[] = data.columns.map((c) => ({ ...c }));
  const records: RecordRow[] = data.records.map((r) => ({ ...r }));

  const schemaPanel =
    columns.length === 0 ? (
      <Text type="supporting">未获取到表结构</Text>
    ) : (
      <Table<ColumnRow>
        idKey="name"
        columns={COLUMN_DEFS}
        data={columns}
        density="compact"
        dividers="rows"
        hasHover
        textOverflow="truncate"
      />
    );

  const recordsPanel =
    records.length === 0 ? (
      <Text type="supporting">暂无更新记录</Text>
    ) : (
      <Table<RecordRow>
        idKey="id"
        columns={RECORD_DEFS}
        data={records}
        density="compact"
        dividers="rows"
        hasHover
      />
    );

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center">
        <Link to="/home/data-center" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
      </HStack>

      <VStack gap={1}>
        <HStack gap={2} align="center">
          <Heading level={2}>{data.name}</Heading>
          <Text type="code" size="sm">
            {data.table}
          </Text>
        </HStack>
        <Text type="supporting">{data.description}</Text>
        <Text type="supporting" size="sm">
          更新于 {formatDateTime(data.updatedAt)}
        </Text>
      </VStack>

      <TabList value={tab} onChange={(value) => setTab(value as TabValue)} hasDivider>
        <Tab value="schema" label={`表结构 (${columns.length})`} />
        <Tab value="records" label={`更新记录 (${records.length})`} />
      </TabList>

      {tab === "schema" ? schemaPanel : recordsPanel}
    </VStack>
  );
}
