import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StrategyForm } from "../../../components/StrategyForm";
import {
  useStrategyQuery,
  useCreateStrategy,
  useUpdateStrategy,
  type Strategy,
  type CreateStrategyInput,
} from "../../../hooks/useStrategies";
import { useFactorsQuery } from "../../../hooks/useFactors";

/**
 * 创建 / 编辑策略共用的表单页。
 * - 无 id 查询参数 → 创建模式
 * - 有 id 查询参数 → 编辑模式（加载并预填现有策略）
 */
export const Route = createFileRoute("/home/strategies/save")({
  validateSearch: (search: Record<string, unknown>): { id?: number } => {
    const raw = search.id;
    const id = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : undefined;
    return id !== undefined && Number.isFinite(id) ? { id } : {};
  },
  component: StrategySavePage,
});

/** 将策略 configJson 转为表单预填值（历史字段缺失时回退默认值） */
function toFormValues(strategy: Strategy): CreateStrategyInput {
  const cfg = strategy.configJson;
  return {
    name: strategy.name,
    description: strategy.description ?? "",
    isPublic: strategy.isPublic,
    factors: cfg?.factors ?? [],
    combine: cfg?.combine ?? "weighted_sum",
    entry: cfg?.entry?.value ?? 65,
    exit: cfg?.exit?.value ?? 30,
    positionSize: cfg?.risk?.positionSize ?? 95,
    stopLoss: cfg?.risk?.stopLoss ?? 8,
    takeProfit: cfg?.risk?.takeProfit ?? 20,
    entryType: cfg?.entry?.type ?? "threshold",
    volumeConfirm: cfg?.entry?.volumeConfirm ?? false,
    limitFilter: cfg?.entry?.limitFilter ?? false,
    stFilter: cfg?.entry?.stFilter ?? false,
    marketFilter: cfg?.entry?.marketFilter ?? false,
  };
}

function StrategySavePage() {
  const navigate = useNavigate();
  const { id } = Route.useSearch();
  const isEdit = id !== undefined;
  const strategyId = id ?? 0;

  const { data: factors = [] } = useFactorsQuery();
  // 创建模式下 strategyId=0，useStrategyQuery 的 enabled 为 false，不会发起请求
  const { data: strategy, isLoading } = useStrategyQuery(strategyId);
  const createStrategy = useCreateStrategy();
  const updateStrategy = useUpdateStrategy();

  if (isEdit && isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (isEdit && !strategy) {
    return <Text type="supporting">策略不存在</Text>;
  }

  const isSubmitting = isEdit ? updateStrategy.isPending : createStrategy.isPending;

  return (
    <VStack gap={4}>
      <Link to="/home/strategies" style={{ textDecoration: "none" }}>
        <Button label="← 返回" variant="ghost" size="sm" />
      </Link>
      <StrategyForm
        title={isEdit ? "编辑策略" : "创建策略"}
        subtitle={
          isEdit
            ? "修改名称、描述、因子组合、入场/出场与风控参数"
            : "组合因子并配置入场/出场与风控参数"
        }
        submitLabel={isEdit ? "保存" : "创建"}
        factors={factors}
        initialValues={isEdit && strategy ? toFormValues(strategy) : undefined}
        isSubmitting={isSubmitting}
        onCancel={() =>
          isEdit
            ? navigate({
                to: "/home/strategies/$strategyId",
                params: { strategyId: String(strategyId) },
              })
            : navigate({ to: "/home/strategies" })
        }
        onSubmit={(values) => {
          if (isEdit) {
            updateStrategy.mutate(
              { ...values, id: strategyId },
              {
                onSuccess: () =>
                  navigate({
                    to: "/home/strategies/$strategyId",
                    params: { strategyId: String(strategyId) },
                  }),
              },
            );
          } else {
            createStrategy.mutate(values, {
              onSuccess: () => navigate({ to: "/home/strategies" }),
            });
          }
        }}
      />
    </VStack>
  );
}
