import { useDeferredValue, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { EmptyState } from "@preline-ui/EmptyState";
import { Selector } from "@preline-ui/Selector";
import { Skeleton } from "@preline-ui/Skeleton";
import { Table, proportional } from "@preline-ui/Table";
import { TextInput } from "@preline-ui/TextInput";
import {
  useGovernanceAsset,
  useGovernanceAssets,
  type GovernanceAsset,
} from "../../../../hooks/useDataGovernance";
import { GovernanceSectionNav } from "./-private/GovernanceSectionNav";
import { GovernanceStatusBadge } from "./-private/GovernanceStatusBadge";
import {
  DOMAIN_LABELS,
  TIER_LABELS,
  formatGovernanceDate,
  qualityStatusMeta,
} from "./-private/governance-ui";

export const Route = createFileRoute(
  "/home/data-management/governance/assets",
)({
  component: GovernanceAssetsPage,
});

type AssetRow = GovernanceAsset & Record<string, unknown>;

const TIER_TONE = {
  tier_0: "error",
  tier_1: "warning",
  tier_2: "neutral",
} as const;

function GovernanceAssetsPage() {
  const assets = useGovernanceAssets();
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [tier, setTier] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("zh-CN"));
  const detail = useGovernanceAsset(selectedKey);

  if (assets.isLoading && !assets.data) {
    return (
      <div className="space-y-3">
        <Skeleton height={40} />
        <Skeleton height={420} />
      </div>
    );
  }
  if (assets.error) {
    return (
      <Card padding={6}>
        <EmptyState title="资产目录读取失败" description={assets.error.message} />
        <div className="flex justify-center">
          <Button size="sm" onClick={() => void assets.refetch()}>
            重新读取
          </Button>
        </div>
      </Card>
    );
  }

  const filtered = (assets.data ?? []).filter((asset) => {
    const matchesQuery =
      !deferredQuery ||
      `${asset.key} ${asset.name} ${asset.contract.businessDefinition}`
        .toLocaleLowerCase("zh-CN")
        .includes(deferredQuery);
    return (
      matchesQuery &&
      (!domain || asset.domain === domain) &&
      (!tier || asset.tier === tier)
    );
  });

  const columns = [
    {
      key: "name",
      header: "资产",
      width: proportional(1.5),
      renderCell: (row: AssetRow) => (
        <button
          type="button"
          className="focus-ring rounded text-left"
          onClick={() => setSelectedKey(row.key)}
        >
          <span className="block text-xs font-semibold text-app-ink hover:text-primary">
            {row.name}
          </span>
          <span className="mt-0.5 block font-mono text-[11px] text-app-muted">
            {row.key}
          </span>
        </button>
      ),
    },
    {
      key: "tier",
      header: "Tier",
      width: proportional(0.55),
      renderCell: (row: AssetRow) => (
        <GovernanceStatusBadge
          label={TIER_LABELS[row.tier]}
          tone={TIER_TONE[row.tier]}
        />
      ),
    },
    {
      key: "domain",
      header: "数据域",
      width: proportional(0.8),
      renderCell: (row: AssetRow) => DOMAIN_LABELS[row.domain] ?? row.domain,
    },
    {
      key: "owner",
      header: "Owner",
      width: proportional(0.9),
      renderCell: (row: AssetRow) => row.responsibilities.owner.name,
    },
    {
      key: "grain",
      header: "粒度",
      width: proportional(1.2),
      renderCell: (row: AssetRow) => (
        <span className="font-mono text-[11px] text-app-muted">{row.contract.grain}</span>
      ),
    },
    {
      key: "sla",
      header: "SLA",
      width: proportional(0.55),
      renderCell: (row: AssetRow) => `${row.contract.freshnessSlaHours}h`,
    },
    {
      key: "source",
      header: "来源标准",
      width: proportional(0.8),
      renderCell: (row: AssetRow) =>
        row.sourceStandardRefs.length > 0
          ? row.sourceStandardRefs.join(", ")
          : "内部",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <GovernanceSectionNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-ink">资产与契约</h2>
          <p className="mt-1 text-xs text-app-muted">
            静态元数据以代码注册表为准，页面只读；质量结果与事故叠加运行证据。
          </p>
        </div>
        <span className="text-[11px] text-app-muted">
          {filtered.length} / {assets.data?.length ?? 0} 个资产
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_180px_160px]">
        <TextInput
          label="搜索资产"
          isLabelHidden
          value={query}
          onChange={setQuery}
          placeholder="搜索名称、键或业务定义"
          startIcon={<Search className="size-4" />}
          aria-label="搜索治理资产"
        />
        <Selector
          label="数据域"
          aria-label="筛选数据域"
          value={domain}
          onChange={setDomain}
          placeholder="全部数据域"
          options={Object.entries(DOMAIN_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <Selector
          label="Tier"
          aria-label="筛选 Tier"
          value={tier}
          onChange={setTier}
          placeholder="全部 Tier"
          options={Object.entries(TIER_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>

      {filtered.length === 0 ? (
        <Card padding={4}>
          <EmptyState
            title="没有匹配的资产"
            description="调整搜索词、数据域或 Tier 条件。"
          />
        </Card>
      ) : (
        <Table<AssetRow>
          idKey="key"
          columns={columns as never}
          data={filtered as AssetRow[]}
          density="compact"
          dividers="rows"
          hasHover
        />
      )}

      {selectedKey ? (
        <Card padding={5}>
          {detail.isLoading && !detail.data ? (
            <Skeleton height={240} />
          ) : detail.error ? (
            <EmptyState title="资产详情读取失败" description={detail.error.message} />
          ) : detail.data ? (
            <AssetDetail detail={detail.data} onClose={() => setSelectedKey(null)} />
          ) : null}
        </Card>
      ) : (
        <Card padding={4} className="border-dashed">
          <p className="text-center text-xs text-app-muted">
            点击资产名称查看责任、契约、血缘和最近质量证据。
          </p>
        </Card>
      )}
    </div>
  );
}

function AssetDetail({
  detail,
  onClose,
}: {
  detail: ReturnType<typeof useGovernanceAsset>["data"] & object;
  onClose: () => void;
}) {
  const { asset, qualityResults, incidents, workTasks } = detail;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-app-ink">{asset.name}</h3>
            <GovernanceStatusBadge
              label={TIER_LABELS[asset.tier]}
              tone={TIER_TONE[asset.tier]}
            />
            <GovernanceStatusBadge
              label={asset.classification === "restricted" ? "受限" : "内部"}
              tone={asset.classification === "restricted" ? "warning" : "neutral"}
            />
          </div>
          <p className="mt-1 font-mono text-[11px] text-app-muted">{asset.key}</p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-app-muted">
            {asset.contract.businessDefinition}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          收起详情
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="text-[11px] text-app-muted">责任</p>
          <p className="mt-1 text-xs text-app-ink">
            Owner · {asset.responsibilities.owner.name}
          </p>
          <p className="mt-1 text-xs text-app-ink">
            Steward · {asset.responsibilities.steward.name}
          </p>
          <p className="mt-1 text-xs text-app-ink">
            Operator · {asset.responsibilities.operator.name}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-app-muted">契约</p>
          <p className="mt-1 text-xs text-app-ink">粒度 · {asset.contract.grain}</p>
          <p className="mt-1 text-xs text-app-ink">
            主键 · {asset.contract.primaryKey.join(", ") || "—"}
          </p>
          <p className="mt-1 text-xs text-app-ink">
            时间字段 · {asset.contract.eventTimeField}
            {asset.contract.knownAtField ? ` / ${asset.contract.knownAtField}` : ""}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-app-muted">保留与来源</p>
          <p className="mt-1 text-xs text-app-ink">{asset.retention.note}</p>
          <p className="mt-1 text-xs text-app-ink">
            来源 · {asset.sourceStandardRefs.join(", ") || "内部"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[11px] text-app-muted">上下游血缘</p>
          <p className="mt-2 break-words font-mono text-[11px] leading-5 text-app-ink">
            {asset.lineage.upstreamAssets.join(" → ") || "无上游"}
            {" · "}
            {asset.lineage.downstreamAssets.join(", ") || "无下游"}
          </p>
          <p className="mt-2 text-[11px] text-app-muted">
            任务 · {asset.lineage.jobTypes.join(", ") || "无同步任务"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-app-muted">最近质量证据</p>
          {qualityResults.length === 0 ? (
            <p className="mt-2 text-xs text-app-muted">暂无质量结果。</p>
          ) : (
            <div className="mt-2 space-y-2">
              {qualityResults.slice(0, 5).map((item) => {
                const status = qualityStatusMeta(item.status);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-b border-app-line pb-2 last:border-0"
                  >
                    <span className="font-mono text-[11px] text-app-muted">
                      {item.ruleId}
                    </span>
                    <span className="flex items-center gap-2 text-[11px]">
                      {formatGovernanceDate(item.checkedAt)}
                      <GovernanceStatusBadge
                        label={status.label}
                        tone={status.tone}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-app-line pt-4 text-[11px] text-app-muted">
        <span>未解决事故 {incidents.filter((item) => !["resolved", "closed"].includes(item.status)).length}</span>
        <span>关联治理任务 {workTasks.length}</span>
        <span>允许消费方 {asset.contract.allowedConsumers.join(", ") || "无"}</span>
      </div>
    </div>
  );
}
