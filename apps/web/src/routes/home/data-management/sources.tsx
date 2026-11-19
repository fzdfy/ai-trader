import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge } from "@preline-ui/Badge";
import { Spinner } from "@preline-ui/Spinner";
import { StatusDot } from "@preline-ui/StatusDot";
import { Table, proportional } from "@preline-ui/Table";
import { Text } from "@preline-ui/Text";
import {
  useSourceCatalog,
  type SourceCatalogItem,
} from "../../../hooks/useDataManagement";
import type { CapabilityHealth } from "../../../hooks/useDataCenter";
import { getCapabilityRuntimeMeta } from "../../../lib/data-management-access";

export const Route = createFileRoute("/home/data-management/sources")({
  component: SourcesPage,
});

type SourceRow = SourceCatalogItem & {
  capabilityRuntime: CapabilityHealth | null;
} & Record<string, unknown>;

const SOURCE_COLUMNS = [
  {
    key: "platform",
    header: "数据源",
    width: proportional(1.1),
    renderCell: (row: SourceRow) => <Badge label={row.platform} variant="blue" />,
  },
  {
    key: "tableName",
    header: "数据表",
    width: proportional(1.2),
    renderCell: (row: SourceRow) => (
      <Link
        to="/home/data-management/tables/$table"
        params={{ table: row.table }}
        className="focus-ring rounded text-sm font-medium text-app-ink hover:text-primary"
      >
        {row.tableName}
      </Link>
    ),
  },
  {
    key: "endpoint",
    header: "取数入口",
    width: proportional(2),
    renderCell: (row: SourceRow) => (
      <div className="max-w-[420px]">
        <Text type="code" size="sm" className="break-all">
          {row.endpoint}
        </Text>
        {row.upstream?.[0] ? (
          <p className="mt-1 truncate text-[11px] text-app-muted">
            {row.upstream[0].method} {row.upstream[0].url}
          </p>
        ) : null}
        {row.riskControl[0] ? (
          <p className="mt-1 line-clamp-2 text-[11px] text-app-muted">
            {row.riskControl[0]}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    key: "fallbackChain",
    header: "降级链",
    width: proportional(1.4),
    renderCell: (row: SourceRow) => {
      const runtimeMeta = getCapabilityRuntimeMeta(row.capabilityRuntime);
      return (
        <div className="flex flex-wrap items-center gap-1">
          <Badge
            label={row.degrade ? "允许降级" : "口径锁定"}
            variant={row.degrade ? "warning" : "error"}
          />
          <Badge label={runtimeMeta.label} variant={runtimeMeta.variant} />
          <span className="text-[11px] text-app-muted">
            {row.fallbackChain.length > 0 ? row.fallbackChain.join(" → ") : "单源"}
          </span>
        </div>
      );
    },
  },
  {
    key: "provider",
    header: "运行状态",
    width: proportional(1.1),
    renderCell: (row: SourceRow) => {
      const breaker = row.provider?.breaker;
      return (
        <div className="flex items-center gap-2">
          <StatusDot
            variant={breaker?.tripped ? "error" : breaker ? "success" : "neutral"}
            label={breaker?.tripped ? "熔断" : breaker ? "正常" : "无遥测"}
          />
          <span className="text-xs text-app-muted">
            {breaker?.tripped
              ? `冷却 ${Math.round(breaker.cooldown_remaining_sec)}s`
              : breaker
                ? `间隔 ≥ ${breaker.min_interval_sec}s`
                : "—"}
          </span>
        </div>
      );
    },
  },
];

function SourcesPage() {
  const { data, isLoading, error } = useSourceCatalog();

  if (isLoading && !data) return <Spinner size="sm" label="读取数据源注册表..." />;
  if (error) return <Text className="text-destructive">{error.message}</Text>;
  if (!data) return <Text type="supporting">暂无数据源信息</Text>;
  const capabilityByName = new Map(
    data.capabilities.map((capability) => [capability.capability, capability]),
  );
  const rows = data.sources.map((source) => ({
    ...source,
    capabilityRuntime: capabilityByName.get(source.capability) ?? null,
  })) as SourceRow[];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-app-ink">数据源注册表</h2>
          <p className="mt-1 text-xs text-app-muted">
            配置以代码和环境变量为准；此处只叠加运行时健康。
          </p>
        </div>
        <Text size="sm" type="supporting">
          观测于 {new Date(data.observedAt).toLocaleTimeString("zh-CN")}
        </Text>
      </div>
      {data.healthError ? (
        <p className="rounded-lg bg-app-warning/15 px-3 py-2 text-xs text-app-ink">
          {data.healthError}，当前仅展示注册信息。
        </p>
      ) : null}
      <Table<SourceRow>
        idKey="id"
        columns={SOURCE_COLUMNS as never}
        data={rows}
        density="compact"
        dividers="rows"
        hasHover
      />
    </div>
  );
}
