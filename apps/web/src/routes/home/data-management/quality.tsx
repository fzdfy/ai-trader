import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@preline-ui/Badge";
import { Spinner } from "@preline-ui/Spinner";
import { StatusDot } from "@preline-ui/StatusDot";
import { Table, proportional } from "@preline-ui/Table";
import { Text } from "@preline-ui/Text";
import { useDataQuality } from "../../../hooks/useDataManagement";

export const Route = createFileRoute("/home/data-management/quality")({
  component: QualityPage,
});

type QualityTableRow = {
  table: string;
  name: string;
  updatedAt: string | null;
  status: "healthy" | "warning" | "missing";
  reason: string | null;
  [key: string]: unknown;
};

type GapRow = {
  id: number;
  symbol: string;
  timeframe: string;
  missingStart: string;
  missingEnd: string;
  detectedAt: string;
  [key: string]: unknown;
};

const TABLE_COLUMNS = [
  { key: "name", header: "数据表", width: proportional(1.2) },
  {
    key: "status",
    header: "状态",
    width: proportional(0.8),
    renderCell: (row: QualityTableRow) => {
      const variant = row.status === "healthy" ? "success" : row.status === "warning" ? "warning" : "error";
      const label = row.status === "healthy" ? "健康" : row.status === "warning" ? "陈旧" : "缺失";
      return (
        <div className="flex items-center gap-2">
          <StatusDot variant={variant} />
          <span className="text-xs">{label}</span>
        </div>
      );
    },
  },
  {
    key: "updatedAt",
    header: "最新业务时间",
    width: proportional(1.5),
    renderCell: (row: QualityTableRow) => (
      <Text size="sm">{row.updatedAt ? new Date(row.updatedAt).toLocaleString("zh-CN") : "—"}</Text>
    ),
  },
  {
    key: "reason",
    header: "说明",
    width: proportional(1.5),
    renderCell: (row: QualityTableRow) => (
      <Text size="sm" type="supporting">
        {row.reason ?? "—"}
      </Text>
    ),
  },
];

const GAP_COLUMNS = [
  { key: "symbol", header: "标的", width: proportional(1) },
  { key: "timeframe", header: "周期", width: proportional(0.6) },
  {
    key: "missingStart",
    header: "缺失区间",
    width: proportional(2),
    renderCell: (row: GapRow) =>
      `${new Date(row.missingStart).toLocaleDateString("zh-CN")} — ${new Date(row.missingEnd).toLocaleDateString("zh-CN")}`,
  },
  {
    key: "detectedAt",
    header: "检测时间",
    width: proportional(1.4),
    renderCell: (row: GapRow) => new Date(row.detectedAt).toLocaleString("zh-CN"),
  },
];

function QualityPage() {
  const { data, isLoading, error } = useDataQuality();
  if (isLoading && !data) return <Spinner size="sm" label="计算数据质量..." />;
  if (error) return <Text className="text-destructive">{error.message}</Text>;
  if (!data) return null;

  const overall =
    data.status === "healthy"
      ? { label: "运行正常", variant: "success" as const }
      : data.status === "critical"
        ? { label: "存在故障", variant: "error" as const }
        : { label: "需要关注", variant: "warning" as const };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["整体状态", overall.label],
          ["未解决断档", String(data.counts.unresolvedGaps)],
          ["陈旧数据表", String(data.counts.staleTables)],
          ["24h 失败任务", String(data.counts.failedJobs)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-app-surface/45 p-4">
            <p className="text-xs text-app-muted">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-app-ink">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-app-ink">表新鲜度</h2>
          <Badge label={overall.label} variant={overall.variant} />
        </div>
        <Table<QualityTableRow>
          idKey="table"
          columns={TABLE_COLUMNS as never}
          data={data.tables as QualityTableRow[]}
          density="compact"
          dividers="rows"
          hasHover
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-app-ink">未解决断档</h2>
        {data.gaps.length === 0 ? (
          <Text type="supporting">当前没有未解决断档。</Text>
        ) : (
          <Table<GapRow>
            idKey="id"
            columns={GAP_COLUMNS as never}
            data={data.gaps as GapRow[]}
            density="compact"
            dividers="rows"
            hasHover
          />
        )}
      </section>
    </div>
  );
}
