import { useMemo, useState } from "react";
import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Card } from "@astryxdesign/core/Card";
import { Switch } from "@astryxdesign/core/Switch";
import { Table, proportional } from "@astryxdesign/core/Table";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog";
import { authClient } from "../../../lib/auth-client";
import {
  useStrategyQuery,
  useUpdateStrategyVisibility,
  useDeleteStrategy,
  COMBINE_LABELS,
  POSITION_SIZING_LABELS,
  STOP_TYPE_LABELS,
  TAKE_TYPE_LABELS,
  SLIPPAGE_TYPE_LABELS,
} from "../../../hooks/useStrategies";
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
  const navigate = useNavigate();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { data: strategy, isLoading } = useStrategyQuery(id);
  const { data: factors = [] } = useFactorsQuery();
  const updateVisibility = useUpdateStrategyVisibility();
  const deleteStrategy = useDeleteStrategy();
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
    const entry = cfg?.entry;
    const entryType = entry?.type === "cross" ? "上穿触发" : "阈值触发";
    const exitType = cfg?.exit?.type === "cross" ? "下穿触发" : "阈值触发";
    const maxHoldingDays = cfg?.exit?.maxHoldingDays ?? 0;
    const pos = cfg?.position;
    const sizingLabel = POSITION_SIZING_LABELS[pos?.sizing ?? "fixed"] ?? "固定比例";
    const baseSize = pos?.baseSize ?? cfg?.risk?.positionSize ?? 95;
    const risk = cfg?.risk;
    const stopTypeLabel = STOP_TYPE_LABELS[risk?.stopType ?? "fixed"] ?? "固定百分比";
    const takeTypeLabel = TAKE_TYPE_LABELS[risk?.takeType ?? "fixed"] ?? "固定百分比";
    const cost = cfg?.cost;
    const slippageTypeLabel = SLIPPAGE_TYPE_LABELS[cost?.slippageType ?? "percent"] ?? "按比例";
    const filters: string[] = [];
    if (entry?.volumeConfirm) filters.push("量能确认");
    if (entry?.limitFilter) filters.push("涨跌停");
    if (entry?.stFilter) filters.push("ST");
    if (entry?.marketFilter) filters.push("大盘");
    return [
      { label: "入场方式", value: entryType },
      { label: "入场阈值", value: `${cfg?.entry?.value ?? 65}%` },
      { label: "入场过滤", value: filters.length ? filters.join("、") : "无" },
      { label: "出场方式", value: exitType },
      { label: "出场阈值", value: `${cfg?.exit?.value ?? 30}%` },
      { label: "持仓时间上限", value: maxHoldingDays > 0 ? `${maxHoldingDays} 天` : "不限" },
      { label: "仓位计算方式", value: sizingLabel },
      { label: "基础仓位", value: `${baseSize}%` },
      { label: "单票上限", value: `${pos?.maxSize ?? 95}%` },
      { label: "总仓位上限", value: `${pos?.totalCap ?? 100}%` },
      { label: "分批建仓", value: pos?.pyramiding ? "开启" : "关闭" },
      { label: "分批止盈", value: pos?.partialExit ? "开启" : "关闭" },
      { label: "止损方式", value: stopTypeLabel },
      { label: "止损线", value: `${risk?.stopLoss ?? 8}%` },
      { label: "止盈方式", value: takeTypeLabel },
      { label: "止盈线", value: `${risk?.takeProfit ?? 20}%` },
      {
        label: "单笔最大亏损",
        value: (risk?.maxLossPerTrade ?? 0) > 0 ? `${risk?.maxLossPerTrade}%` : "不限",
      },
      {
        label: "连续亏损熔断",
        value: (risk?.maxConsecutiveLosses ?? 0) > 0 ? `${risk?.maxConsecutiveLosses} 次` : "不限",
      },
      { label: "佣金费率", value: `万分之${cost?.commissionRate ?? 3}` },
      { label: "印花税", value: `万分之${cost?.stampTaxRate ?? 10}` },
      { label: "过户费", value: `万分之${cost?.transferFeeRate ?? 0.1}` },
      { label: "最低佣金", value: `${cost?.minCommission ?? 5} 元` },
      {
        label: "滑点",
        value:
          (cost?.slippageType ?? "percent") === "percent"
            ? `${slippageTypeLabel} 万分之${cost?.slippageValue ?? 2}`
            : `${slippageTypeLabel} ${cost?.slippageValue ?? 0.2} 元`,
      },
    ];
  }, [strategy]);

  if (isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (!strategy) {
    return <Text type="supporting">策略不存在</Text>;
  }

  // 仅创建者本人可编辑 / 修改公开状态
  const canEdit = strategy.userId === userId;

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center" style={{ justifyContent: "space-between" }}>
        <Link to="/home/strategies" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
        {canEdit ? (
          <DropdownMenu
            button={{
              label: "操作",
              icon: <Icon icon="moreHorizontal" />,
              variant: "ghost",
              size: "sm",
              isIconOnly: true,
            }}
            hasChevron={false}
            items={[
              {
                label: "编辑",
                icon: Pencil,
                onClick: () =>
                  navigate({ to: "/home/strategies/save", search: { id: strategy.id } }),
              },
              { label: "删除", icon: Trash2, onClick: () => setIsDeleteOpen(true) },
            ]}
          />
        ) : null}
      </HStack>

      <VStack gap={1}>
        <Heading level={2}>{strategy.name}</Heading>
        {strategy.description ? <Text type="supporting">{strategy.description}</Text> : null}
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
      <ConfirmDeleteDialog
        isOpen={isDeleteOpen}
        title="删除策略"
        message={`确认删除策略「${strategy.name}」？`}
        isLoading={deleteStrategy.isPending}
        onOpenChange={(open) => !open && setIsDeleteOpen(false)}
        onConfirm={() => {
          deleteStrategy.mutate(strategy.id, {
            onSuccess: () => navigate({ to: "/home/strategies" }),
          });
        }}
      />
    </VStack>
  );
}
