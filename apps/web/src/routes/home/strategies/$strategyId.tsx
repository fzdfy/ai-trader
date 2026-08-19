import { useMemo, useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Card } from "@astryxdesign/core/Card";
import { Switch } from "@astryxdesign/core/Switch";
import { Table, proportional } from "@astryxdesign/core/Table";
import { authClient } from "../../../lib/auth-client";
import { useStrategyQuery, useUpdateStrategyVisibility, useUpdateStrategy, COMBINE_LABELS } from "../../../hooks/useStrategies";
import { useFactorsQuery } from "../../../hooks/useFactors";
import { StrategyEditDialog } from "../../../components/StrategyEditDialog";

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
  const updateVisibility = useUpdateStrategyVisibility();
  const updateStrategy = useUpdateStrategy();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const userId = authClient.useSession().data?.user.id;

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

  // 交易参数（历史策略缺失时回退默认值）
  const tradeParams = useMemo(() => {
    const cfg = strategy?.configJson;
    return [
      { label: "入场阈值", value: `${cfg?.entry?.value ?? 65}%` },
      { label: "出场阈值", value: `${cfg?.exit?.value ?? 30}%` },
      { label: "仓位比例", value: `${cfg?.risk?.positionSize ?? 95}%` },
      { label: "止损线", value: `${cfg?.risk?.stopLoss ?? 8}%` },
      { label: "止盈线", value: `${cfg?.risk?.takeProfit ?? 20}%` },
    ];
  }, [strategy]);

  if (isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (!strategy) {
    return <Text type="supporting">策略不存在</Text>;
  }

  // 仅创建者本人可修改公开状态
  const canEdit = strategy.userId === userId;

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
        <Link to="/home/strategies" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
        {canEdit ? (
          <Button label="编辑" variant="primary" size="sm" onClick={() => setIsEditOpen(true)} />
        ) : null}
      </HStack>

      <VStack gap={1}>
        <Heading level={2}>{strategy.name}</Heading>
        {strategy.description ? (
          <Text type="supporting">{strategy.description}</Text>
        ) : null}
      </VStack>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack gap={2} align="center">
            <Text style={{ fontWeight: 600 }}>因子构成</Text>
            <Text type="supporting" size="sm">
              · 合成方式 {COMBINE_LABELS[strategy.configJson?.combine ?? "weighted_sum"]}
            </Text>
          </HStack>
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

      <Card padding={5}>
        <VStack gap={4}>
          <Text style={{ fontWeight: 600 }}>交易参数</Text>
          <HStack gap={6} style={{ flexWrap: "wrap" }}>
            {tradeParams.map((p) => (
              <VStack key={p.label} gap={1}>
                <Text type="supporting" size="sm">
                  {p.label}
                </Text>
                <Text style={{ fontWeight: 600 }}>{p.value}</Text>
              </VStack>
            ))}
          </HStack>
        </VStack>
      </Card>

      <Card padding={5}>
        <Switch
          label="公开"
          description={canEdit ? "开启后其他用户也能看到该策略" : "仅创建者可修改公开状态"}
          value={strategy.isPublic}
          isDisabled={!canEdit}
          isLoading={updateVisibility.isPending}
          onChange={(checked) => updateVisibility.mutate({ id: strategy.id, isPublic: checked })}
        />
      </Card>

      <StrategyEditDialog
        strategy={strategy}
        factors={factors}
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSubmit={(input) => updateStrategy.mutate(input)}
      />
    </VStack>
  );
}
