/**
 * 同步中心 — 模块状态总览 + 同步记录。
 *
 * 上方：各同步模块状态卡片（运行中显示实时进度），下方：同步记录分页表格。
 * 数据源：GET /api/v1/sync/modules（3s 轮询）与 GET /api/v1/sync/records。
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { VStack, HStack } from "@preline-ui/Stack";
import { Text } from "@preline-ui/Text";
import { Button } from "@preline-ui/Button";
import { Spinner } from "@preline-ui/Spinner";
import { StatusDot } from "@preline-ui/StatusDot";
import { ProgressBar } from "@preline-ui/ProgressBar";
import { Table, proportional } from "@preline-ui/Table";
import { Dialog, DialogHeader } from "@preline-ui/Dialog";
import { TextArea } from "@preline-ui/TextArea";
import {
  useRunSync,
  useSyncModules,
  useSyncRecords,
  moduleName,
  type SyncModuleStatus,
  type SyncRecord,
} from "../../../hooks/useDataSync";
import { useRetrySyncModule } from "../../../hooks/useDataManagement";
import { canRetryModule, canRunManualSync } from "../../../lib/data-management-access";

const PAGE_SIZE = 20;
type ModuleRow = SyncModuleStatus & Record<string, unknown>;

/** 状态 → 展示元信息（点色 / 文案） */
const STATUS_META: Record<
  SyncModuleStatus["status"],
  { variant: "success" | "error" | "accent" | "neutral"; label: string }
> = {
  running: { variant: "accent", label: "运行中" },
  success: { variant: "success", label: "成功" },
  failed: { variant: "error", label: "失败" },
  never: { variant: "neutral", label: "从未运行" },
};

/** 状态元信息（兜底为 never，避免索引越界） */
function statusMeta(status: SyncModuleStatus["status"]) {
  return STATUS_META[status] ?? STATUS_META.never;
}

/** ISO 时间 → YYYY-MM-DD HH:mm:ss */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
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

/** 记录表格列定义 */
const RECORD_COLUMNS = [
  {
    key: "jobType",
    header: "模块",
    width: proportional(1.2),
    renderCell: (r: SyncRecord) => (
      <Text weight="medium">{moduleName(r.jobType)}</Text>
    ),
  },
  {
    key: "status",
    header: "状态",
    width: proportional(0.8),
    renderCell: (r: SyncRecord) => {
      const meta =
        r.status === "running"
          ? statusMeta("running")
          : r.status === "success"
            ? statusMeta("success")
            : statusMeta("failed");
      return (
        <HStack gap={2} align="center">
          <StatusDot
            variant={meta.variant}
            isPulsing={r.status === "running"}
          />
          <Text size="sm">{meta.label}</Text>
        </HStack>
      );
    },
  },
  {
    key: "progress",
    header: "已同步",
    width: proportional(1.2),
    renderCell: (r: SyncRecord) =>
      r.processed != null && r.total != null ? (
        <Text size="sm">
          {r.processed}/{r.total}
        </Text>
      ) : (
        <Text size="sm" type="supporting">
          -
        </Text>
      ),
  },
  {
    key: "startedAt",
    header: "开始时间",
    width: proportional(1.6),
    renderCell: (r: SyncRecord) => (
      <Text size="sm">{formatDateTime(r.startedAt)}</Text>
    ),
  },
  {
    key: "durationMs",
    header: "耗时",
    width: proportional(0.8),
    renderCell: (r: SyncRecord) => (
      <Text size="sm" type="supporting">
        {formatDuration(r.durationMs)}
      </Text>
    ),
  },
  {
    key: "message",
    header: "消息",
    width: proportional(2.4),
    renderCell: (r: SyncRecord) => (
      <Text size="sm" type="supporting" style={{ wordBreak: "break-all" }}>
        {r.error ?? r.message ?? "-"}
      </Text>
    ),
  },
];

/** 同步中心主体 */
export function SyncCenterTab() {
  const [jobFilter, setJobFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<
    { type: "manual" } | { type: "retry"; mod: SyncModuleStatus } | null
  >(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: modData, isFetching: modsLoading } = useSyncModules();
  const { data: recData, isFetching: recsLoading } = useSyncRecords(page, PAGE_SIZE, jobFilter);
  const runSync = useRunSync();
  const retryModule = useRetrySyncModule();

  const modules = modData?.modules ?? [];
  const records = recData?.items ?? [];
  const total = recData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasRunningJob = modules.some((mod) => mod.status === "running");
  const moduleColumns = [
    {
      key: "name",
      header: "模块",
      width: proportional(1.5),
      renderCell: (row: ModuleRow) => (
        <div>
          <Text weight="medium">{row.name}</Text>
          <Text type="code" size="sm" className="mt-0.5 block text-app-faint">
            {row.jobType}
          </Text>
        </div>
      ),
    },
    {
      key: "status",
      header: "状态",
      width: proportional(1),
      renderCell: (row: ModuleRow) => {
        const meta = statusMeta(row.status);
        return (
          <div className="flex items-center gap-2">
            <StatusDot
              variant={meta.variant}
              isPulsing={row.status === "running"}
              tooltip={meta.label}
            />
            <Text size="sm">{meta.label}</Text>
          </div>
        );
      },
    },
    {
      key: "progress",
      header: "进度",
      width: proportional(1.5),
      renderCell: (row: ModuleRow) =>
        row.status === "running" ? (
          <div className="min-w-36">
            <ProgressBar
              value={row.total && row.total > 0 ? (row.processed ?? 0) : 0}
              max={row.total && row.total > 0 ? row.total : 1}
              label={row.message ?? "同步中"}
              isLabelHidden
              hasValueLabel={Boolean(row.total && row.total > 0)}
              isIndeterminate={!row.total}
              variant="accent"
              formatValueLabel={(value, max) => `${value}/${max}`}
            />
          </div>
        ) : row.processed != null && row.total != null ? (
          `${row.processed}/${row.total}`
        ) : (
          "—"
        ),
    },
    {
      key: "finishedAt",
      header: "最近运行",
      width: proportional(1.4),
      renderCell: (row: ModuleRow) => (
        <div>
          <Text size="sm">{formatDateTime(row.finishedAt ?? row.startedAt)}</Text>
          {row.error ? (
            <Text size="sm" type="supporting" maxLines={1}>
              {row.error}
            </Text>
          ) : null}
        </div>
      ),
    },
    {
      key: "dependsOn",
      header: "上游依赖",
      width: proportional(1),
      renderCell: (row: ModuleRow) => (
        <Text type="code" size="sm">
          {row.dependsOn ?? "—"}
        </Text>
      ),
    },
    {
      key: "today",
      header: "今日",
      width: proportional(1),
      renderCell: (row: ModuleRow) =>
        `成功 ${row.todaySuccess} · 失败 ${row.todayFailed}`,
    },
    {
      key: "action",
      header: "",
      width: proportional(0.7),
      renderCell: (row: ModuleRow) =>
        row.status === "failed" ? (
          <Button
            label="重试"
            size="sm"
            variant="secondary"
            isDisabled={!canRetryModule(row.status, "重试", hasRunningJob)}
            onClick={() => openAction({ type: "retry", mod: row })}
          />
        ) : null,
    },
  ];

  // 模块筛选按钮组：全部 + 各模块
  const filters: { jobType: string | undefined; label: string }[] = [
    { jobType: undefined, label: "全部" },
    ...modules.map((m) => ({ jobType: m.jobType, label: m.name })),
  ];

  const handleFilter = (jobType: string | undefined) => {
    setJobFilter(jobType);
    setPage(1);
  };

  const openAction = (next: { type: "manual" } | { type: "retry"; mod: SyncModuleStatus }) => {
    setAction(next);
    setReason(next.type === "manual" ? "手动刷新数据" : `恢复 ${next.mod.name} 失败任务`);
    setActionError(null);
  };

  const closeAction = () => {
    if (runSync.isPending || retryModule.isPending) return;
    setAction(null);
    setReason("");
    setActionError(null);
  };

  const submitAction = async () => {
    if (!action) return;
    setActionError(null);
    try {
      if (action.type === "manual") {
        await runSync.mutateAsync(reason);
      } else {
        await retryModule.mutateAsync({
          jobType: action.mod.jobType,
          reason,
        });
      }
      setAction(null);
      setReason("");
    } catch (error) {
      setActionError((error as Error).message);
    }
  };

  const actionReady =
    action?.type === "manual"
      ? canRunManualSync(hasRunningJob) && reason.trim().length > 0
      : action?.type === "retry"
        ? canRetryModule(action.mod.status, reason, hasRunningJob)
        : false;

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center" style={{ flexWrap: "wrap" }}>
        <VStack gap={0}>
          <Text weight="medium">同步运行控制</Text>
          <Text size="sm" type="supporting">
            手动同步会依次执行现有行情与特征管道，并记录操作原因。
          </Text>
        </VStack>
        <Button
          label={hasRunningJob ? "同步运行中" : "手动同步"}
          size="sm"
          variant="primary"
          isDisabled={!canRunManualSync(hasRunningJob)}
          onClick={() => openAction({ type: "manual" })}
          className="ml-auto"
        />
        <Link
          to="/home/data-management/audit"
          className="focus-ring rounded-lg px-2.5 py-2 text-xs font-medium text-app-muted hover:bg-app-surface hover:text-app-ink"
        >
          查看审计
        </Link>
      </HStack>

      {/* 模块状态卡片网格 */}
      <VStack gap={2}>
        <Text size="sm" type="supporting">
          各模块最近一次同步状态与实时进度（3 秒自动刷新）
        </Text>
        {modsLoading && modules.length === 0 ? (
          <Spinner size="sm" label="加载同步状态中..." />
        ) : (
          <Table<ModuleRow>
            idKey="jobType"
            columns={moduleColumns as never}
            data={modules as ModuleRow[]}
            density="compact"
            dividers="rows"
            hasHover
          />
        )}
      </VStack>

      {/* 同步记录 */}
      <VStack gap={3}>
        <HStack gap={2} align="center" style={{ flexWrap: "wrap" }}>
          <Text weight="medium">同步记录</Text>
          <Text size="sm" type="supporting">
            共 {total} 条
          </Text>
          <HStack gap={1} style={{ marginLeft: "auto", flexWrap: "wrap" }}>
            {filters.map((f) => (
              <Button
                key={f.jobType ?? "all"}
                label={f.label}
                size="sm"
                variant={jobFilter === f.jobType ? "primary" : "secondary"}
                onClick={() => handleFilter(f.jobType)}
              />
            ))}
          </HStack>
        </HStack>

        {recsLoading && records.length === 0 ? (
          <Spinner size="sm" label="加载同步记录中..." />
        ) : (
          <Table<SyncRecord>
            idKey="id"
            columns={RECORD_COLUMNS as never}
            data={records}
            density="compact"
            dividers="rows"
            hasHover
          />
        )}

        {/* 分页 */}
        <HStack gap={3} align="center" style={{ justifyContent: "flex-end" }}>
          <Text type="supporting" size="sm">
            第 {page} / {totalPages} 页
          </Text>
          <HStack gap={2}>
            <Button
              label="上一页"
              size="sm"
              variant="secondary"
              isDisabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            />
            <Button
              label="下一页"
              size="sm"
              variant="secondary"
              isDisabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          </HStack>
        </HStack>
      </VStack>

      <Dialog isOpen={action != null} onOpenChange={(open) => !open && closeAction()}>
        {action ? (
          <>
            <DialogHeader
              title={action.type === "manual" ? "确认手动同步" : `重试 ${action.mod.name}`}
              subtitle={
                action.type === "manual"
                  ? "本次操作会写入现有同步任务记录，并进入操作审计。"
                  : "仅重试当前失败模块，不会自动重跑上游依赖。"
              }
              onOpenChange={closeAction}
            />
            <div className="space-y-4 p-5">
              <div className="rounded-xl bg-app-surface p-3 text-xs text-app-muted">
                {action.type === "manual" ? (
                  <p>范围：板块、日线、复权、周期线、特征、资金流及资金榜相关管道。</p>
                ) : (
                  <p>
                    模块：<span className="font-mono text-app-ink">{action.mod.jobType}</span>
                    {action.mod.finishedAt
                      ? ` · 上次结束 ${formatDateTime(action.mod.finishedAt)}`
                      : null}
                  </p>
                )}
              </div>
              <TextArea
                label="操作原因"
                description="用于审计追踪，请说明为什么现在执行。"
                value={reason}
                onChange={setReason}
                maxLength={500}
                isDisabled={runSync.isPending || retryModule.isPending}
                autoFocus
              />
              {hasRunningJob ? (
                <p className="text-xs text-destructive">已有同步任务运行中，请等待结束。</p>
              ) : null}
              {actionError ? (
                <p className="text-xs text-destructive" role="alert">
                  {actionError}
                </p>
              ) : null}
              <HStack gap={2} justify="end">
                <Button
                  label="取消"
                  size="sm"
                  variant="secondary"
                  isDisabled={runSync.isPending || retryModule.isPending}
                  onClick={closeAction}
                />
                <Button
                  label={action.type === "manual" ? "确认同步" : "确认重试"}
                  size="sm"
                  variant="primary"
                  isDisabled={!actionReady}
                  isLoading={runSync.isPending || retryModule.isPending}
                  onClick={() => void submitAction()}
                />
              </HStack>
            </div>
          </>
        ) : null}
      </Dialog>
    </VStack>
  );
}
