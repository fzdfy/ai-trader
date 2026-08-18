import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import { StrategyCreateDialog } from "../../components/StrategyCreateDialog";
import { useStrategiesQuery, useCreateStrategy } from "../../hooks/useStrategies";
import { useFactorsQuery } from "../../hooks/useFactors";

type StrategyRow = Record<string, unknown> & {
  id: number;
  name: string;
  description: string;
  isSystem: boolean;
  creator: string;
};

const STRATEGY_COLUMNS = [
  {
    key: "name",
    header: "名称",
    width: proportional(2),
    renderCell: (row: StrategyRow) => (
      <Link
        to="/home/strategies/$strategyId"
        params={{ strategyId: String(row.id) }}
        style={{ textDecoration: "none" }}
      >
        <Text style={{ color: "var(--color-text-accent)" }}>{row.name}</Text>
      </Link>
    ),
  },
  { key: "description", header: "描述", width: proportional(3) },
  {
    key: "isSystem",
    header: "类型",
    width: proportional(1),
    renderCell: (row: StrategyRow) => <Badge label={row.isSystem ? "系统" : "自定义"} />,
  },
  { key: "creator", header: "创建者", width: proportional(1) },
];

export const Route = createFileRoute("/home/strategies")({
  component: StrategiesPage,
});

function StrategiesPage() {
  const { data: strategies = [], isLoading } = useStrategiesQuery();
  const { data: factors = [] } = useFactorsQuery();
  const createStrategy = useCreateStrategy();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const rows: StrategyRow[] = useMemo(
    () =>
      strategies.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        isSystem: s.isSystem,
        creator: s.creator,
      })),
    [strategies],
  );

  return (
    <VStack gap={4}>
      <HStack gap={3} align="center" style={{ justifyContent: "space-between" }}>
        <Heading level={2}>策略</Heading>
        <Button label="创建策略" variant="primary" onClick={() => setIsCreateOpen(true)} />
      </HStack>

      {isLoading ? (
        <Spinner size="sm" label="加载中..." />
      ) : strategies.length === 0 ? (
        <Text type="supporting">暂无策略</Text>
      ) : (
        <Table<StrategyRow>
          idKey="id"
          columns={STRATEGY_COLUMNS}
          data={rows}
          density="balanced"
          dividers="rows"
          hasHover
          textOverflow="truncate"
        />
      )}

      <StrategyCreateDialog
        isOpen={isCreateOpen}
        factors={factors}
        onOpenChange={setIsCreateOpen}
        onSubmit={(input) => createStrategy.mutate(input)}
      />
    </VStack>
  );
}
