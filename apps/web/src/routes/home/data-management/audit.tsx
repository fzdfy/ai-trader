import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@preline-ui/Button";
import { Spinner } from "@preline-ui/Spinner";
import { StatusDot } from "@preline-ui/StatusDot";
import { Table, proportional } from "@preline-ui/Table";
import { Text } from "@preline-ui/Text";
import {
  useAdminAudit,
  type AdminAuditRecord,
} from "../../../hooks/useDataManagement";

export const Route = createFileRoute("/home/data-management/audit")({
  component: AuditPage,
});

type AuditRow = AdminAuditRecord & Record<string, unknown>;

const actionLabel = {
  sync_run: "手动同步",
  sync_retry: "模块重试",
  governance_task_start: "治理任务开始",
  governance_task_complete: "治理任务完成",
  governance_task_cancel: "治理任务取消",
  governance_incident_acknowledge: "数据事故确认",
  governance_incident_resolve: "数据事故解决",
} as const;

const statusVariant = {
  accepted: "neutral",
  running: "accent",
  success: "success",
  failed: "error",
  interrupted: "warning",
} as const;

const statusLabel = {
  accepted: "已受理",
  running: "运行中",
  success: "成功",
  failed: "失败",
  interrupted: "中断",
} as const;

const COLUMNS = [
  {
    key: "createdAt",
    header: "触发时间",
    width: proportional(1.3),
    renderCell: (row: AuditRow) => new Date(row.createdAt).toLocaleString("zh-CN"),
  },
  {
    key: "action",
    header: "操作",
    width: proportional(0.9),
    renderCell: (row: AuditRow) => actionLabel[row.action] ?? row.action,
  },
  {
    key: "actorName",
    header: "操作者",
    width: proportional(1.2),
    renderCell: (row: AuditRow) => (
      <div>
        <Text size="sm">{row.actorName ?? row.actorUserId}</Text>
        {row.actorEmail ? (
          <Text type="supporting" size="sm" maxLines={1}>
            {row.actorEmail}
          </Text>
        ) : null}
      </div>
    ),
  },
  {
    key: "targetJobType",
    header: "范围",
    width: proportional(1.1),
    renderCell: (row: AuditRow) => (
      <Text type="code" size="sm">
        {row.targetJobType ??
          (row.action.startsWith("governance_") ? "治理证据" : "全部同步管道")}
      </Text>
    ),
  },
  {
    key: "reason",
    header: "原因",
    width: proportional(1.8),
    renderCell: (row: AuditRow) => (
      <Text size="sm" type="supporting">
        {row.reason ?? "—"}
      </Text>
    ),
  },
  {
    key: "status",
    header: "状态",
    width: proportional(0.9),
    renderCell: (row: AuditRow) => (
      <div className="flex items-center gap-2">
        <StatusDot
          variant={statusVariant[row.status] ?? "neutral"}
        />
        <span className="text-xs">{statusLabel[row.status] ?? row.status}</span>
      </div>
    ),
  },
  {
    key: "jobRunId",
    header: "任务 ID",
    width: proportional(0.8),
    renderCell: (row: AuditRow) => (
      <Text type="code" size="sm">
        {row.jobRunId ?? "—"}
      </Text>
    ),
  },
  {
    key: "error",
    header: "结果",
    width: proportional(2),
    renderCell: (row: AuditRow) => (
      <Text size="sm" type={row.error ? "body" : "supporting"} className="break-all">
        {row.error ?? "—"}
      </Text>
    ),
  },
];

function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminAudit(page);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));

  if (isLoading && !data) return <Spinner size="sm" label="读取操作审计..." />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-ink">操作审计</h2>
          <p className="mt-1 text-xs text-app-muted">写操作只追加记录，不允许从管理界面删除。</p>
        </div>
        <Text size="sm" type="supporting">
          共 {data?.total ?? 0} 条
        </Text>
      </div>
      <Table<AuditRow>
        idKey="id"
        columns={COLUMNS as never}
        data={(data?.items ?? []) as AuditRow[]}
        density="compact"
        dividers="rows"
        hasHover
      />
      <div className="flex items-center justify-end gap-3">
        <Text size="sm" type="supporting">
          第 {page} / {totalPages} 页
        </Text>
        <Button
          label="上一页"
          size="sm"
          variant="secondary"
          isDisabled={page <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        />
        <Button
          label="下一页"
          size="sm"
          variant="secondary"
          isDisabled={page >= totalPages}
          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
        />
      </div>
    </div>
  );
}
