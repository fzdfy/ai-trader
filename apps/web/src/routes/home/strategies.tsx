import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StrategyCreateDialog } from "../../components/StrategyCreateDialog";
import { useStrategiesQuery, useCreateStrategy } from "../../hooks/useStrategies";
import { useFactorsQuery } from "../../hooks/useFactors";

export const Route = createFileRoute("/home/strategies")({
  component: StrategiesPage,
});

function StrategiesPage() {
  const navigate = Route.useNavigate();
  const { data: strategies = [], isLoading } = useStrategiesQuery();
  const { data: factors = [] } = useFactorsQuery();
  const createStrategy = useCreateStrategy();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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
        <List hasDividers>
          {strategies.map((strategy) => (
            <ListItem
              key={strategy.id}
              label={strategy.name}
              description={strategy.description ?? ""}
              endContent={<Badge label={strategy.isSystem ? "系统" : "自定义"} />}
              onClick={() =>
                navigate({
                  to: "/home/strategies/$strategyId",
                  params: { strategyId: String(strategy.id) },
                })
              }
            />
          ))}
        </List>
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
