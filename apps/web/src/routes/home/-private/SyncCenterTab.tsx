/**
 * 同步中心 — 模块状态总览 + 同步记录。
 *
 * 上方：各同步模块状态卡片（运行中显示实时进度），下方：同步记录分页表格。
 * 数据源：GET /api/v1/sync/modules（3s 轮询）与 GET /api/v1/sync/records。
 */
import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Card } from "@astryxdesign/core/Card";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Table, proportional } from "@astryxdesign/core/Table";
import {
  useSyncModules,
  useSyncRecords,
  moduleName,
  type SyncModuleStatus,
  type SyncRecord,
} from "../../../hooks/useDataSync";

const PAGE_SIZE = 20;

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

/** 单个模块状态卡片 */
function ModuleCard({ mod }: { mod: SyncModuleStatus }) {
  const meta = statusMeta(mod.status);
  const isRunning = mod.status === "running";
  // 进度值：运行中且有总量时显示真实进度，否则不确定进度条
  const hasTotal = mod.total != null && mod.total > 0;

  return (
    <Card variant="default" padding={3}>
      <VStack gap={3}>
        {/* 状态行：状态点 + 模块名 + 状态文案 */}
        <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
          <HStack gap={2} align="center">
            <StatusDot
              variant={meta.variant}
              label={meta.label}
              isPulsing={isRunning}
              tooltip={meta.label}
            />
            <Text weight="medium">{mod.name}</Text>
          </HStack>
          <Text size="sm" type={isRunning ? "body" : "supporting"}>
            {meta.label}
          </Text>
        </HStack>

        {/* 运行中：进度条 + 阶段说明；已完成：最近运行时间 */}
        {isRunning ? (
          <VStack gap={1}>
            <ProgressBar
              value={hasTotal ? (mod.processed ?? 0) : 0}
              max={hasTotal ? (mod.total ?? 1) : 1}
              label={mod.message ?? "同步中"}
              isLabelHidden
              hasValueLabel={hasTotal}
              isIndeterminate={!hasTotal}
              variant="accent"
              formatValueLabel={(v, m) => `${v}/${m}`}
            />
            {mod.message && (
              <Text size="sm" type="supporting">
                {mod.message}
              </Text>
            )}
          </VStack>
        ) : (
          <VStack gap={1}>
            {mod.error ? (
              <Text size="sm" type="supporting" style={{ wordBreak: "break-all" }}>
                失败原因：{mod.error}
              </Text>
            ) : (
              <Text size="sm" type="supporting">
                最近运行：{formatDateTime(mod.finishedAt ?? mod.startedAt)}
              </Text>
            )}
          </VStack>
        )}

        {/* 今日统计 + 处理量 + 耗时 */}
        <HStack gap={3} align="center">
          <Text size="sm" type="supporting">
            今日成功 {mod.todaySuccess} · 失败 {mod.todayFailed}
          </Text>
          {!isRunning && mod.durationMs != null && (
            <Text size="sm" type="supporting">
              耗时 {formatDuration(mod.durationMs)}
            </Text>
          )}
          {mod.processed != null && mod.total != null && !isRunning && (
            <Text size="sm" type="supporting">
              处理 {mod.processed}/{mod.total}
            </Text>
          )}
        </HStack>
      </VStack>
    </Card>
  );
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
            label={meta.label}
            isPulsing={r.status === "running"}
          />
          <Text size="sm">{meta.label}</Text>
        </HStack>
      );
    },
  },
  {
    key: "progress",
    header: "进度",
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

  const { data: modData, isFetching: modsLoading } = useSyncModules();
  const { data: recData, isFetching: recsLoading } = useSyncRecords(page, PAGE_SIZE, jobFilter);

  const modules = modData?.modules ?? [];
  const records = recData?.items ?? [];
  const total = recData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 模块筛选按钮组：全部 + 各模块
  const filters: { jobType: string | undefined; label: string }[] = [
    { jobType: undefined, label: "全部" },
    ...modules.map((m) => ({ jobType: m.jobType, label: m.name })),
  ];

  const handleFilter = (jobType: string | undefined) => {
    setJobFilter(jobType);
    setPage(1);
  };

  return (
    <VStack gap={4}>
      {/* 模块状态卡片网格 */}
      <VStack gap={2}>
        <Text size="sm" type="supporting">
          各模块最近一次同步状态与实时进度（3 秒自动刷新）
        </Text>
        {modsLoading && modules.length === 0 ? (
          <Spinner size="sm" label="加载同步状态中..." />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
              gap: "var(--spacing-3)",
            }}
          >
            {modules.map((m) => (
              <ModuleCard key={m.jobType} mod={m} />
            ))}
          </div>
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
    </VStack>
  );
}
