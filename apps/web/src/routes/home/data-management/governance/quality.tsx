import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { EmptyState } from "@preline-ui/EmptyState";
import { Selector } from "@preline-ui/Selector";
import { Skeleton } from "@preline-ui/Skeleton";
import { Table, proportional } from "@preline-ui/Table";
import {
  useGovernanceAssets,
  useQualityEvidence,
  useQualityRules,
  type QualityEvidence,
  type QualityRule,
} from "../../../../hooks/useDataGovernance";
import { GovernanceSectionNav } from "./-private/GovernanceSectionNav";
import { GovernanceStatusBadge } from "./-private/GovernanceStatusBadge";
import {
  DIMENSION_LABELS,
  formatGovernanceDate,
  qualityStatusMeta,
} from "./-private/governance-ui";

export const Route = createFileRoute(
  "/home/data-management/governance/quality",
)({
  component: GovernanceQualityPage,
});

const RULE_COLUMNS = [
  {
    key: "ruleId",
    header: "规则",
    width: proportional(1.8),
    renderCell: (row: QualityRule) => (
      <div>
        <p className="font-mono text-[11px] font-medium text-app-ink">{row.id}</p>
        <p className="mt-0.5 text-[11px] text-app-muted">
          v{row.version} · {row.checkKey}
        </p>
      </div>
    ),
  },
  {
    key: "assetKey",
    header: "资产",
    width: proportional(1),
    renderCell: (row: QualityRule) => (
      <span className="font-mono text-[11px]">{row.assetKey}</span>
    ),
  },
  {
    key: "dimension",
    header: "维度",
    width: proportional(0.7),
    renderCell: (row: QualityRule) =>
      DIMENSION_LABELS[row.dimension] ?? row.dimension,
  },
  {
    key: "severity",
    header: "严重度",
    width: proportional(0.55),
    renderCell: (row: QualityRule) => (
      <GovernanceStatusBadge
        label={row.severity === "critical" ? "Critical" : "Warning"}
        tone={row.severity === "critical" ? "error" : "warning"}
      />
    ),
  },
  {
    key: "triggers",
    header: "触发任务",
    width: proportional(1.2),
    renderCell: (row: QualityRule) => row.triggerJobTypes.join(", "),
  },
];

const RESULT_COLUMNS = [
  {
    key: "ruleId",
    header: "规则",
    width: proportional(1.5),
    renderCell: (row: QualityEvidence) => (
      <span className="font-mono text-[11px] text-app-ink">{row.ruleId}</span>
    ),
  },
  {
    key: "assetKey",
    header: "资产",
    width: proportional(0.9),
    renderCell: (row: QualityEvidence) => (
      <span className="font-mono text-[11px]">{row.assetKey}</span>
    ),
  },
  {
    key: "status",
    header: "结果",
    width: proportional(0.6),
    renderCell: (row: QualityEvidence) => {
      const status = qualityStatusMeta(row.status);
      return <GovernanceStatusBadge label={status.label} tone={status.tone} />;
    },
  },
  {
    key: "observedValue",
    header: "观测值",
    width: proportional(0.6),
    renderCell: (row: QualityEvidence) =>
      row.observedValue == null ? "—" : Number(row.observedValue).toFixed(3),
  },
  {
    key: "context",
    header: "执行上下文",
    width: proportional(1.2),
    renderCell: (row: QualityEvidence) => (
      <span className="text-[11px] text-app-muted">
        run {row.jobRunId ?? "—"} · request {row.requestId?.slice(0, 8) ?? "—"}
      </span>
    ),
  },
  {
    key: "checkedAt",
    header: "检查时间",
    width: proportional(0.9),
    renderCell: (row: QualityEvidence) => formatGovernanceDate(row.checkedAt),
  },
];

function GovernanceQualityPage() {
  const rules = useQualityRules();
  const assets = useGovernanceAssets();
  const [assetKey, setAssetKey] = useState("");
  const [status, setStatus] = useState("");
  const evidence = useQualityEvidence({ assetKey, status });

  if ((rules.isLoading && !rules.data) || (evidence.isLoading && !evidence.data)) {
    return (
      <div className="space-y-3">
        <Skeleton height={40} />
        <Skeleton height={180} />
        <Skeleton height={360} />
      </div>
    );
  }
  if (rules.error || evidence.error) {
    return (
      <Card padding={6}>
        <EmptyState
          title="质量证据读取失败"
          description={(rules.error ?? evidence.error)?.message}
        />
        <div className="flex justify-center">
          <Button
            size="sm"
            onClick={() => {
              void rules.refetch();
              void evidence.refetch();
            }}
          >
            重新读取
          </Button>
        </div>
      </Card>
    );
  }

  const resultItems = evidence.data ?? [];
  const passed = resultItems.filter((item) => item.status === "passed").length;
  const warnings = resultItems.filter((item) => item.status === "warning").length;
  const failed = resultItems.filter(
    (item) => item.status === "failed" || item.status === "error",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <GovernanceSectionNav />
      <div>
        <h2 className="text-sm font-semibold text-app-ink">质量规则与结果</h2>
        <p className="mt-1 text-xs text-app-muted">
          规则版本与触发范围只读；结果追加保存实际指标、任务与请求上下文。
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "通过", value: passed, Icon: CircleCheck, color: "text-app-success" },
          { label: "警告", value: warnings, Icon: CircleAlert, color: "text-app-warning" },
          { label: "失败 / 错误", value: failed, Icon: CircleX, color: "text-destructive" },
        ].map(({ label, value, Icon, color }) => (
          <Card key={label} padding={4} className="border-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-app-muted">{label}</p>
              <Icon className={`size-4 ${color}`} aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-app-ink">
              {value}
            </p>
          </Card>
        ))}
      </section>

      <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_180px]">
        <Selector
          label="资产"
          aria-label="按资产筛选质量证据"
          value={assetKey}
          onChange={setAssetKey}
          placeholder="全部资产"
          options={(assets.data ?? []).map((asset) => ({
            value: asset.key,
            label: `${asset.name} · ${asset.key}`,
          }))}
        />
        <Selector
          label="结果"
          aria-label="按结果筛选"
          value={status}
          onChange={setStatus}
          placeholder="全部结果"
          options={[
            { value: "passed", label: "通过" },
            { value: "warning", label: "警告" },
            { value: "failed", label: "失败" },
            { value: "error", label: "执行错误" },
          ]}
        />
      </div>

      <Card padding={0} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h3 className="text-sm font-semibold text-app-ink">最近质量证据</h3>
          <GovernanceStatusBadge
            label={`${resultItems.length} 条`}
            tone={failed > 0 ? "error" : warnings > 0 ? "warning" : "success"}
          />
        </div>
        {resultItems.length === 0 ? (
          <EmptyState
            title="没有匹配的质量结果"
            description="等待同步后扫描或调整筛选条件。"
          />
        ) : (
          <div className="border-t border-app-line">
            <Table<QualityEvidence & Record<string, unknown>>
              idKey="id"
              columns={RESULT_COLUMNS as never}
              data={resultItems as Array<QualityEvidence & Record<string, unknown>>}
              density="compact"
              dividers="rows"
              hasHover
            />
          </div>
        )}
      </Card>

      <Card padding={0} className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h3 className="text-sm font-semibold text-app-ink">版本化规则</h3>
          <span className="flex items-center gap-1.5 text-[11px] text-app-muted">
            <Activity className="size-3.5" />
            {rules.data?.length ?? 0} 条
          </span>
        </div>
        <div className="border-t border-app-line">
          <Table<QualityRule & Record<string, unknown>>
            idKey="id"
            columns={RULE_COLUMNS as never}
            data={(rules.data ?? []) as Array<QualityRule & Record<string, unknown>>}
            density="compact"
            dividers="rows"
          />
        </div>
      </Card>
    </div>
  );
}
