import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Button } from "@astryxdesign/core/Button";
import { StrategyForm } from "../../../components/StrategyForm";
import { useCreateStrategy } from "../../../hooks/useStrategies";
import { useFactorsQuery } from "../../../hooks/useFactors";

export const Route = createFileRoute("/home/strategies/create")({
  component: StrategyCreatePage,
});

function StrategyCreatePage() {
  const navigate = useNavigate();
  const { data: factors = [] } = useFactorsQuery();
  const createStrategy = useCreateStrategy();

  return (
    <VStack gap={4}>
      <Link to="/home/strategies" style={{ textDecoration: "none" }}>
        <Button label="← 返回" variant="ghost" size="sm" />
      </Link>
      <StrategyForm
        title="创建策略"
        subtitle="组合因子并配置入场/出场与风控参数"
        submitLabel="创建"
        factors={factors}
        isSubmitting={createStrategy.isPending}
        onCancel={() => navigate({ to: "/home/strategies" })}
        onSubmit={(values) =>
          createStrategy.mutate(values, {
            onSuccess: () => navigate({ to: "/home/strategies" }),
          })
        }
      />
    </VStack>
  );
}
