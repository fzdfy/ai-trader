/**
 * 数据中心 — 单表详情。
 *
 * 展示「中文名 + 实际表名 + 描述 + 更新时间」，并以下方标签页切换：
 *   - 表结构：该表的字段清单（名称 / 类型 / 主键 / 可空 / 默认值）
 *   - 数据来源：该表的上游平台，以及「调用链 → 请求方式 完整源 URL」的完整取数路径
 *   - 数据同步：同步策略 / 回补 / 降级 / 风控
 *   - 更新记录：写入该表的同步任务执行历史（来自 job_run）
 * 数据源：GET /api/v1/data-center/tables/:table
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Section } from "@astryxdesign/core/Section";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Table, proportional } from "@astryxdesign/core/Table";
import {
  useDataCenterTable,
  useDataSourcesHealth,
  type CapabilityHealth,
  type DataTableColumn,
  type DataTableRecord,
  type DataSourceMeta,
  type ProviderBreakerStatus,
} from "../../../hooks/useDataCenter";

type TabValue = "schema" | "sources" | "sync" | "records";

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

/** 能力降级链运行态 → 状态点元信息；无运行时数据（如无降级链的表）返回 null */
function fallbackRuntimeMeta(
  capHealth: CapabilityHealth | undefined,
): { variant: "success" | "warning" | "error"; label: string } | null {
  if (!capHealth) return null;
  if (!capHealth.available) return { variant: "error", label: "全链路不可用" };
  if (capHealth.degraded) {
    return { variant: "warning", label: `已降级 · 生效源 ${capHealth.active_source}` };
  }
  return { variant: "success", label: `主源正常 · ${capHealth.active_source}` };
}

/** 降级链单节点：标注主源 / 当前生效源 / 熔断源 */
function chainNodeMeta(
  name: string,
  index: number,
  capHealth: CapabilityHealth | undefined,
  breakerByName: Map<string, ProviderBreakerStatus>,
): { label: string; variant: "blue" | "neutral" | "error" } {
  if (breakerByName.get(name)?.tripped) {
    return { label: index === 0 ? `${name} · 主 · 熔断` : `${name} · 熔断`, variant: "error" };
  }
  if (index === 0) return { label: `${name} · 主`, variant: "blue" };
  if (capHealth?.active_source === name) return { label: `${name} · 生效`, variant: "neutral" };
  return { label: name, variant: "neutral" };
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

/** 数据同步面板中的单个分区：标题 + 内容 */
function SyncBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section>
      <VStack gap={3}>
        <Text style={{ fontWeight: 600 }}>{title}</Text>
        {children}
      </VStack>
    </Section>
  );
}

/** 平台中文名 → provider 英文名（用于关联运行时健康）；多源聚合 / 本地派生 / 交易所官方无直接 provider */
const PLATFORM_PROVIDER: Record<string, string> = {
  东方财富: "eastmoney",
  腾讯: "tencent",
  同花顺: "ths",
  通达信: "mootdx",
  新浪: "sina",
};

/** 单个数据来源条目 */
function SourceBlock({
  source,
  breakerByName,
}: {
  source: DataSourceMeta;
  breakerByName: Map<string, ProviderBreakerStatus>;
}) {
  const provider = PLATFORM_PROVIDER[source.platform];
  const breaker = provider ? breakerByName.get(provider) : undefined;

  return (
    <Section>
      <VStack gap={3}>
        <HStack gap={2} align="center">
          <Badge label={source.platform} variant="blue" />
        </HStack>
        <MetadataList columns="single" label={{ position: "start", width: 96 }}>
          <MetadataListItem label="接口 / 方法">
            {source.upstream && source.upstream.length > 0 ? (
              <VStack gap={1}>
                {source.upstream.map((up) => (
                  <HStack key={up.url} gap={2} align="center" wrap="wrap">
                    <Text type="code" size="sm" wordBreak="break-all">
                      {source.endpoint}
                    </Text>
                    <Text type="supporting" size="sm">
                      →
                    </Text>
                    <Badge label={up.method} variant={up.method === "GET" ? "blue" : "warning"} />
                    <Text type="code" size="sm" wordBreak="break-all">
                      {up.url}
                    </Text>
                    {up.target ? (
                      <Text type="supporting" size="sm">
                        {up.target}
                      </Text>
                    ) : null}
                  </HStack>
                ))}
              </VStack>
            ) : (
              <Text type="code" size="sm" wordBreak="break-all">
                {source.endpoint}
              </Text>
            )}
          </MetadataListItem>
          {provider ? (
            <MetadataListItem label="运行状态">
              {breaker ? (
                <HStack gap={2} align="center">
                  <StatusDot
                    variant={breaker.tripped ? "error" : "success"}
                    label={breaker.tripped ? "熔断中" : "正常"}
                  />
                  <Text size="sm">
                    {breaker.tripped
                      ? `熔断中 · 冷却剩余 ${Math.round(breaker.cooldown_remaining_sec)}s（连续失败 ${breaker.fail_streak}/${breaker.threshold}）`
                      : `正常 · 请求间隔 ≥ ${breaker.min_interval_sec}s，连续失败 ${breaker.threshold} 次熔断 ${Math.round(breaker.cooldown_sec / 60)} 分钟`}
                  </Text>
                </HStack>
              ) : (
                <HStack gap={2} align="center">
                  <StatusDot variant="neutral" label="无熔断遥测" />
                  <Text type="supporting" size="sm">
                    该源无健康遥测
                  </Text>
                </HStack>
              )}
            </MetadataListItem>
          ) : null}
          {source.note ? (
            <MetadataListItem label="说明">
              <Text type="supporting" size="sm">
                {source.note}
              </Text>
            </MetadataListItem>
          ) : null}
        </MetadataList>
      </VStack>
    </Section>
  );
}

/** 单表详情主体 */
export function DataTableDetailView({ table }: { table: string }) {
  const [tab, setTab] = useState<TabValue>("schema");
  const { data, isLoading } = useDataCenterTable(table);
  // 仅在「数据来源」「数据同步」tab 打开时轮询数据源健康（其余 tab 不请求）
  const { data: health } = useDataSourcesHealth(tab === "sync" || tab === "sources");

  const healthLookup = useMemo(() => {
    const breakerByName = new Map<string, ProviderBreakerStatus>();
    const capByName = new Map<string, CapabilityHealth>();
    for (const provider of health?.providers ?? []) {
      if (provider.breaker) breakerByName.set(provider.name, provider.breaker);
    }
    for (const cap of health?.capabilities ?? []) {
      capByName.set(cap.capability, cap);
    }
    return { breakerByName, capByName };
  }, [health]);

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

  const sourcesPanel =
    data.sources.length === 0 ? (
      <Text type="supporting">暂无数据来源信息</Text>
    ) : (
      <VStack gap={3}>
        {data.sources.map((source) => (
          <SourceBlock
            key={`${source.platform}-${source.endpoint}`}
            source={source}
            breakerByName={healthLookup.breakerByName}
          />
        ))}
      </VStack>
    );

  const fallbackHealth = healthLookup.capByName.get(data.fallback.capability);
  const fallbackRuntime = fallbackRuntimeMeta(fallbackHealth);

  const syncPanel = (
    <VStack gap={4}>
      <SyncBlock title="同步策略">
        <MetadataList columns="single" label={{ position: "start", width: 96 }}>
          <MetadataListItem label="触发方式">{data.syncPolicy.trigger}</MetadataListItem>
          <MetadataListItem label="调度表达式">
            {data.syncPolicy.cron ? (
              <Text type="code" size="sm">
                {data.syncPolicy.cron}
              </Text>
            ) : (
              "-"
            )}
          </MetadataListItem>
          <MetadataListItem label="依赖任务">{data.syncPolicy.dependsOn ?? "-"}</MetadataListItem>
          <MetadataListItem label="截止时间">{data.syncPolicy.deadline ?? "-"}</MetadataListItem>
        </MetadataList>
        {data.syncPolicy.note ? (
          <Text type="supporting" size="sm">
            {data.syncPolicy.note}
          </Text>
        ) : null}
      </SyncBlock>

      <SyncBlock title="回补">
        <HStack gap={2} align="center">
          <Badge
            label={data.backfill.separate ? "独立回补任务" : "无独立回补"}
            variant={data.backfill.separate ? "success" : "neutral"}
          />
        </HStack>
        {data.backfill.separate ? (
          <MetadataList columns="single" label={{ position: "start", width: 96 }}>
            <MetadataListItem label="触发方式">{data.backfill.trigger ?? "-"}</MetadataListItem>
            <MetadataListItem label="调度表达式">
              {data.backfill.cron ? (
                <Text type="code" size="sm">
                  {data.backfill.cron}
                </Text>
              ) : (
                "-"
              )}
            </MetadataListItem>
          </MetadataList>
        ) : null}
        <Text type="supporting" size="sm">
          {data.backfill.note}
        </Text>
      </SyncBlock>

      <SyncBlock title="降级">
        <MetadataList columns="single" label={{ position: "start", width: 96 }}>
          <MetadataListItem label="能力域">
            <Text type="code" size="sm">
              {data.fallback.capability}
            </Text>
          </MetadataListItem>
          <MetadataListItem label="降级策略">
            <Badge
              label={data.fallback.degrade ? "允许降级" : "禁止降级（口径锁定）"}
              variant={data.fallback.degrade ? "warning" : "error"}
            />
          </MetadataListItem>
          {fallbackRuntime ? (
            <MetadataListItem label="运行状态">
              <HStack gap={2} align="center">
                <StatusDot variant={fallbackRuntime.variant} label={fallbackRuntime.label} />
                <Text size="sm">{fallbackRuntime.label}</Text>
              </HStack>
            </MetadataListItem>
          ) : null}
        </MetadataList>
        <VStack gap={1}>
          <Text type="supporting" size="sm">
            降级链
          </Text>
          {data.fallback.chain.length === 0 ? (
            <Text type="supporting" size="sm">
              无降级链（单一数据源）
            </Text>
          ) : (
            <HStack gap={1} align="center" wrap="wrap">
              {data.fallback.chain.map((name, index) => {
                const node = chainNodeMeta(name, index, fallbackHealth, healthLookup.breakerByName);
                return (
                  <HStack key={name} gap={1} align="center">
                    {index > 0 ? (
                      <Text type="supporting" size="sm">
                        →
                      </Text>
                    ) : null}
                    <Badge label={node.label} variant={node.variant} />
                  </HStack>
                );
              })}
            </HStack>
          )}
        </VStack>
        {data.fallback.note ? (
          <Text type="supporting" size="sm">
            {data.fallback.note}
          </Text>
        ) : null}
      </SyncBlock>

      <SyncBlock title="风控">
        {data.riskControl.length === 0 ? (
          <Text type="supporting" size="sm">
            暂无特设风控
          </Text>
        ) : (
          <VStack gap={1}>
            {data.riskControl.map((item) => (
              <HStack key={item} gap={2} align="start">
                <Text type="supporting" size="sm">
                  •
                </Text>
                <Text size="sm">{item}</Text>
              </HStack>
            ))}
          </VStack>
        )}
      </SyncBlock>
    </VStack>
  );

  const panels: Record<TabValue, ReactNode> = {
    schema: schemaPanel,
    sources: sourcesPanel,
    sync: syncPanel,
    records: recordsPanel,
  };

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
        <Tab value="sources" label={`数据来源 (${data.sources.length})`} />
        <Tab value="sync" label="数据同步" />
        <Tab value="records" label={`更新记录 (${records.length})`} />
      </TabList>

      {panels[tab]}
    </VStack>
  );
}
