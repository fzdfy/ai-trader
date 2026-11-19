import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Database,
  FileClock,
  RefreshCw,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Card } from "@preline-ui/Card";
import { Grid } from "@preline-ui/Grid";
import { Spinner } from "@preline-ui/Spinner";
import { Text } from "@preline-ui/Text";
import { useDataQuality, useSourceCatalog } from "../../../hooks/useDataManagement";
import { useDataCenterTables } from "../../../hooks/useDataCenter";
import { useSyncModules } from "../../../hooks/useDataSync";

export const Route = createFileRoute("/home/data-management/")({
  component: DataManagementOverview,
});

const statusCopy = {
  healthy: { label: "运行正常", variant: "success" as const },
  warning: { label: "需要关注", variant: "warning" as const },
  critical: { label: "存在故障", variant: "error" as const },
};

function DataManagementOverview() {
  const quality = useDataQuality();
  const sources = useSourceCatalog();
  const tables = useDataCenterTables();
  const sync = useSyncModules();
  const running = sync.data?.modules.filter((module) => module.status === "running").length ?? 0;
  const failed = sync.data?.modules.filter((module) => module.status === "failed").length ?? 0;
  const summary = quality.data;
  const meta = summary ? statusCopy[summary.status] : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card padding={4} className="border-0">
          <Text size="sm" type="supporting">
            数据质量
          </Text>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-2xl font-semibold tabular-nums text-app-ink">
              {summary?.counts.healthyTables ?? "—"}
              <span className="ml-1 text-xs font-normal text-app-muted">
                / {summary?.counts.totalTables ?? "—"} 健康
              </span>
            </span>
            {meta ? <Badge label={meta.label} variant={meta.variant} /> : null}
          </div>
        </Card>
        <Card padding={4} className="border-0">
          <Text size="sm" type="supporting">
            同步运行
          </Text>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-app-ink">
            {running}
            <span className="ml-1 text-xs font-normal text-app-muted">运行中</span>
          </p>
          <Text size="sm" type="supporting">
            最近 24 小时失败 {summary?.counts.failedJobs ?? failed}
          </Text>
        </Card>
        <Card padding={4} className="border-0">
          <Text size="sm" type="supporting">
            数据断档
          </Text>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-app-ink">
            {summary?.counts.unresolvedGaps ?? 0}
          </p>
          <Text size="sm" type="supporting">
            未解决 {summary?.counts.staleTables ?? 0} 张表超过 SLA
          </Text>
        </Card>
        <Card padding={4} className="border-0">
          <Text size="sm" type="supporting">
            数据源
          </Text>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-app-ink">
            {sources.data?.capabilities.length ?? "—"}
            <span className="ml-1 text-xs font-normal text-app-muted">能力域</span>
          </p>
          <Text size="sm" type="supporting">
            {summary?.counts.degradedProviders ?? 0} 个 Provider 熔断
          </Text>
        </Card>
      </section>

      <Grid columns={{ minWidth: 230, max: 4 }} gap={3}>
        {[
          {
            label: "数据源",
            description: "Provider、降级链与熔断状态",
            href: "/home/data-management/sources",
            icon: Database,
            count: `${sources.data?.sources.length ?? 0} 条来源映射`,
          },
          {
            label: "数据表",
            description: "Schema、来源、同步策略与运行记录",
            href: "/home/data-management/tables",
            icon: Table2,
            count: `${tables.data?.tables.length ?? 0} 张表`,
          },
          {
            label: "数据同步",
            description: "模块进度、失败重试与同步记录",
            href: "/home/data-management/sync",
            icon: RefreshCw,
            count: `${running} 运行中 · ${failed} 失败`,
          },
          {
            label: "数据质量",
            description: "新鲜度、断档与 Provider 可用性",
            href: "/home/data-management/quality",
            icon: Activity,
            count: `${summary?.counts.unresolvedGaps ?? 0} 个未解决断档`,
          },
          {
            label: "操作审计",
            description: "手动同步和失败重试的完整记录",
            href: "/home/data-management/audit",
            icon: FileClock,
            count: "只读",
          },
          {
            label: "数据治理",
            description: "资产责任、质量证据、来源版本与事故",
            href: "/home/data-management/governance",
            icon: ShieldCheck,
            count: "超级管理员",
          },
        ].map(({ label, description, href, icon: Icon, count }) => (
          <Link
            key={href}
            to={href as "/home/data-management"}
            className="focus-ring rounded-xl bg-app-surface/45 p-4 transition hover:bg-app-surface"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-app-surface text-primary">
                <Icon className="size-4" />
              </span>
              <span className="text-[11px] text-app-muted">{count}</span>
            </div>
            <h2 className="mt-4 text-sm font-semibold text-app-ink">{label}</h2>
            <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
          </Link>
        ))}
      </Grid>

      {quality.isLoading && !summary ? <Spinner size="sm" label="读取数据健康状态..." /> : null}
    </div>
  );
}
