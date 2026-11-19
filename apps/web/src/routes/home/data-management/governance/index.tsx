import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  CircleAlert,
  GitCompareArrows,
  ListChecks,
  Radar,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { EmptyState } from "@preline-ui/EmptyState";
import { Skeleton } from "@preline-ui/Skeleton";
import { Table, proportional } from "@preline-ui/Table";
import { useGovernanceOverview, type DataIncident } from "../../../../hooks/useDataGovernance";
import { GovernanceSectionNav } from "./-private/GovernanceSectionNav";
import { GovernanceLinkButton } from "./-private/GovernanceLinkButton";
import { GovernanceStatusBadge } from "./-private/GovernanceStatusBadge";
import {
  formatGovernanceDate,
  incidentStatusMeta,
  readinessLabel,
} from "./-private/governance-ui";

export const Route = createFileRoute("/home/data-management/governance/")({
  component: GovernanceOverviewPage,
});

const INCIDENT_COLUMNS = [
  {
    key: "title",
    header: "事故",
    width: proportional(1.5),
    renderCell: (row: DataIncident) => (
      <div>
        <p className="text-xs font-medium text-app-ink">{row.title}</p>
        <p className="mt-0.5 text-[11px] text-app-muted">{row.description}</p>
      </div>
    ),
  },
  {
    key: "assetKey",
    header: "影响资产",
    width: proportional(1),
    renderCell: (row: DataIncident) => (
      <span className="font-mono text-[11px] text-app-ink">{row.assetKey ?? "平台"}</span>
    ),
  },
  {
    key: "status",
    header: "状态",
    width: proportional(0.7),
    renderCell: (row: DataIncident) => {
      const status = incidentStatusMeta(row.status);
      return <GovernanceStatusBadge label={status.label} tone={status.tone} />;
    },
  },
  {
    key: "openedAt",
    header: "开始时间",
    width: proportional(1),
    renderCell: (row: DataIncident) => formatGovernanceDate(row.openedAt),
  },
];

function GovernanceOverviewPage() {
  const { data, isLoading, error, refetch } = useGovernanceOverview();

  if (isLoading && !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} height={index < 4 ? 112 : 170} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Card padding={6}>
        <EmptyState title="治理状态读取失败" description={error.message} />
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            重新读取
          </Button>
        </div>
      </Card>
    );
  }
  if (!data) return null;

  const criticalFailure = data.qualityResults.find(
    (item) =>
      item.severity === "critical" &&
      (item.status === "failed" || item.status === "error"),
  );
  const activeCriticalIncident = data.incidents.find(
    (item) =>
      item.severity === "critical" &&
      item.status !== "resolved" &&
      item.status !== "closed",
  );
  const blocked = Boolean(criticalFailure || activeCriticalIncident);
  const source = data.sourceStandards[0];
  const latestVersion =
    typeof source?.latestTask?.payloadJson.versionLabel === "string"
      ? source.latestTask.payloadJson.versionLabel
      : null;
  const latestTaskActive =
    source?.latestTask?.status === "pending" ||
    source?.latestTask?.status === "in_progress";
  const failedResults = data.qualityResults.filter(
    (item) => item.status === "failed" || item.status === "error",
  ).length;
  const pendingTasks = data.workTasks.filter((item) => item.status === "pending").length;
  const lastEvidence = data.qualityResults
    .map((item) => item.checkedAt)
    .sort()
    .at(-1);

  return (
    <div className="flex flex-col gap-4">
      <GovernanceSectionNav />
      <section
        aria-label="治理摘要"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {[
          ["资产覆盖", String(data.counts.assets), "已登记治理资产"],
          ["Tier 0 资产", String(data.counts.tier0), "研究关键数据"],
          ["治理任务", String(data.counts.pendingTasks), "待处理"],
          ["未解决事故", String(data.counts.activeIncidents), "待恢复"],
        ].map(([label, value, note]) => (
          <Card key={label} padding={4} className="border-0">
            <p className="text-xs text-app-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-app-ink">
              {value}
              <span className="ml-1 text-[11px] font-normal text-app-muted">{note}</span>
            </p>
          </Card>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <Card padding={5} className="border-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-app-muted">
                Research gate
              </p>
              <h2 className="mt-1 text-sm font-semibold text-app-ink">研究门禁</h2>
            </div>
            <GovernanceStatusBadge
              label={blocked ? "存在阻断" : "未触发阻断"}
              tone={blocked ? "error" : "success"}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-app-muted">
            {blocked
              ? `${criticalFailure?.assetKey ?? activeCriticalIncident?.assetKey ?? "Tier 0 资产"} 存在严重质量失败或未解决事故。当前门禁策略为${readinessLabel(data.gateMode)}，新回测、选股与个股分析按策略处理。`
              : "Tier 0 资产没有未解决的严重质量事故，研究入口可继续创建任务。"}
          </p>
          <div className="mt-4 grid gap-3 border-t border-app-line pt-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-app-muted">阻断资产</p>
              <p className="mt-1 font-mono text-xs font-semibold text-app-ink">
                {criticalFailure?.assetKey ?? activeCriticalIncident?.assetKey ?? "无"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-app-muted">最后质量证据</p>
              <p className="mt-1 text-xs font-medium text-app-ink">
                {formatGovernanceDate(lastEvidence)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-app-muted">当前策略</p>
              <p className="mt-1 text-xs font-medium text-app-ink">
                {readinessLabel(data.gateMode)}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <GovernanceLinkButton
              href="/home/data-management/governance/incidents"
              variant="primary"
            >
              查看事故
            </GovernanceLinkButton>
            <GovernanceLinkButton href="/home/data-management/governance/quality">
              查看质量证据
            </GovernanceLinkButton>
          </div>
        </Card>

        <Card padding={5} className="border-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-app-muted">
                Source standard
              </p>
              <h2 className="mt-1 text-sm font-semibold text-app-ink">来源标准版本</h2>
            </div>
            <GovernanceStatusBadge
              label={
                latestVersion
                  ? latestTaskActive
                    ? "待审阅"
                    : "变化已处理"
                  : "基线固定"
              }
              tone={latestVersion ? (latestTaskActive ? "warning" : "neutral") : "success"}
            />
          </div>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-lg font-semibold text-app-ink">
                v{source?.versionLabel ?? "—"}
              </p>
              <p className="mt-1 text-[11px] text-app-muted">
                当前固定基线 · checksum 已验证
              </p>
            </div>
            <Radar className="size-8 text-primary" aria-hidden />
          </div>
          {latestVersion ? (
            <div className="mt-4 rounded-lg bg-app-surface/70 p-3">
              <p className="text-[11px] text-app-muted">上游变化</p>
              <p className="mt-1 font-mono text-sm font-semibold text-app-ink">
                v{latestVersion}
              </p>
              <p className="mt-1 truncate font-mono text-[11px] text-app-muted">
                {source?.latestTask?.relatedId ?? "—"}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs leading-5 text-app-muted">
              最近一次巡检未发现 commit 或 checksum 变化。
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <GovernanceLinkButton href="/home/data-management/governance/source-standards">
              查看版本
            </GovernanceLinkButton>
            {latestTaskActive ? (
              <GovernanceLinkButton
                href="/home/data-management/governance/work-tasks"
                variant="ghost"
              >
                打开审阅任务
              </GovernanceLinkButton>
            ) : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {
            label: "资产与契约",
            note: `${data.counts.assets} 个资产 · ${data.counts.tier0} 个 Tier 0`,
            href: "/home/data-management/governance/assets",
            icon: Boxes,
          },
          {
            label: "质量规则与结果",
            note: `${data.counts.rules} 条规则 · ${failedResults} 条最近失败`,
            href: "/home/data-management/governance/quality",
            icon: Activity,
          },
          {
            label: "来源标准",
            note: latestVersion
              ? latestTaskActive
                ? "上游版本待审阅"
                : "上游变化已处理"
              : "固定版本无漂移",
            href: "/home/data-management/governance/source-standards",
            icon: GitCompareArrows,
          },
          {
            label: "治理任务",
            note: `${pendingTasks} 条待处理`,
            href: "/home/data-management/governance/work-tasks",
            icon: ListChecks,
          },
          {
            label: "数据事故",
            note: `${data.counts.activeIncidents} 条未解决`,
            href: "/home/data-management/governance/incidents",
            icon: CircleAlert,
          },
          {
            label: "治理边界",
            note: "元数据只读 · 操作全程审计",
            href: "/home/data-management/governance/assets",
            icon: ShieldCheck,
          },
        ].map(({ label, note, href, icon: Icon }) => (
          <Link
            key={label}
            to={href as "/home/data-management/governance"}
            className="focus-ring rounded-xl border border-app-line bg-app-panel p-4 transition hover:border-primary/30 hover:bg-app-surface/35"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-app-surface text-primary">
                <Icon className="size-4" />
              </span>
              <span className="text-right text-[11px] text-app-muted">{note}</span>
            </div>
            <h2 className="mt-4 text-sm font-semibold text-app-ink">{label}</h2>
          </Link>
        ))}
      </section>

      <Card padding={0} className="overflow-hidden border-app-line">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-app-ink">未解决数据事故</h2>
            <p className="mt-1 text-[11px] text-app-muted">
              事故只允许状态流转，事件记录追加保留。
            </p>
          </div>
          <GovernanceLinkButton
            href="/home/data-management/governance/incidents"
            variant="ghost"
          >
            全部事故
          </GovernanceLinkButton>
        </div>
        {data.incidents.length === 0 ? (
          <EmptyState
            title="当前没有未解决事故"
            description="研究门禁所需的资产未报告严重质量异常。"
          />
        ) : (
          <div className="border-t border-app-line">
            <Table<DataIncident>
              idKey="id"
              columns={INCIDENT_COLUMNS as never}
              data={data.incidents}
              density="compact"
              dividers="rows"
              hasHover
            />
          </div>
        )}
      </Card>
    </div>
  );
}
