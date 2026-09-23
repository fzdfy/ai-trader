/**
 * 数据中心 — 数据表卡片列表。
 *
 * 每张卡片展示「中文名 + 实际表名 + 描述 + 更新时间」，点击进入表详情。
 * 数据源：GET /api/v1/data-center/tables
 */
import { Link } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Spinner } from "@astryxdesign/core/Spinner";
import { useDataCenterTables, type DataTableSummary } from "../../../hooks/useDataCenter";

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 时间 → YYYY-MM-DD HH:mm */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "暂无数据";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "暂无数据";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 单张数据表卡片，点击跳转详情 */
function DataTableCard({ item }: { item: DataTableSummary }) {
  return (
    <Link
      to="/home/data-center/$table"
      params={{ table: item.table }}
      style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}
    >
      <Card variant="default" padding={4} height="100%">
        <VStack gap={3} justify="between" height="100%">
          <VStack gap={1}>
            <Text type="large" weight="medium">
              {item.name}
            </Text>
            <Text type="code" size="sm">
              {item.table}
            </Text>
          </VStack>
          <Text type="supporting" size="sm" maxLines={3}>
            {item.description}
          </Text>
          <Text type="supporting" size="sm">
            更新于 {formatDateTime(item.updatedAt)}
          </Text>
        </VStack>
      </Card>
    </Link>
  );
}

/** 数据表卡片网格 */
export function DataTableList() {
  const { data, isLoading } = useDataCenterTables();
  const tables = data?.tables ?? [];

  if (isLoading && tables.length === 0) {
    return <Spinner size="sm" label="加载数据表清单中..." />;
  }

  if (tables.length === 0) {
    return <Text type="supporting">暂无可展示的数据表</Text>;
  }

  return (
    <Grid columns={{ minWidth: 300, max: 4 }} gap={3}>
      {tables.map((item) => (
        <DataTableCard key={item.table} item={item} />
      ))}
    </Grid>
  );
}
