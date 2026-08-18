import { useMemo } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Card } from "@astryxdesign/core/Card";
import { Table, proportional } from "@astryxdesign/core/Table";
import { useStrategyQuery } from "../../../hooks/useStrategies";
import { useFactorsQuery } from "../../../hooks/useFactors";

type FactorRow = Record<string, unknown> & {
  label: string;
  value: number;
  weight: number;
};

const FACTOR_COLUMNS = [
  { key: "label" as const, header: "因子", width: proportional(2) },
  { key: "value" as const, header: "值", width: proportional(1) },
  {
    key: "weight" as const,
    header: "权重",
    width: proportional(1),
    renderCell: (row: FactorRow) => <Text>{row.weight}%</Text>,
  },
];

export const Route = createFileRoute("/home/strategies/$strategyId")({
  component: StrategyDetailPage,
});

function StrategyDetailPage() {
  const { strategyId } = useParams({ from: "/home/strategies/$strategyId" });
  const id = Number(strategyId);
  const { data: strategy, isLoading } = useStrategyQuery(id);
  const { data: factors = [] } = useFactorsQuery();

  // 因子名 → 显示名 的映射
  const labelMap = useMemo(() => new Map(factors.map((f) => [f.name, f.label])), [factors]);

  const rows: FactorRow[] = useMemo(() => {
    const factorList = strategy?.configJson?.factors ?? [];
    return factorList.map((f) => ({
      label: labelMap.get(f.name) ?? f.name,
      value: f.value,
      weight: f.weight,
    }));
  }, [strategy, labelMap]);

  if (isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (!strategy) {
    return <Text type="supporting">策略不存在</Text>;
  }

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center">
        <Link to="/home/strategies" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
      </HStack>

      <VStack gap={1}>
        <Heading level={2}>{strategy.name}</Heading>
        {strategy.description ? (
          <Text type="supporting">{strategy.description}</Text>
        ) : null}
      </VStack>

      <Card padding={5}>
        <VStack gap={4}>
          <Text style={{ fontWeight: 600 }}>因子构成</Text>
          {rows.length === 0 ? (
            <Text type="supporting">该策略未包含因子</Text>
          ) : (
            <Table<FactorRow>
              idKey="label"
              columns={FACTOR_COLUMNS}
              data={rows}
              density="compact"
              dividers="rows"
              hasHover
            />
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
