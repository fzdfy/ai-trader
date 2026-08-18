import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { Badge } from "@astryxdesign/core/Badge";
import { Spinner } from "@astryxdesign/core/Spinner";
import { FactorCreateDialog } from "../../components/FactorCreateDialog";
import { useFactorsQuery, useCreateFactor, FACTOR_CATEGORY_LABELS } from "../../hooks/useFactors";

export const Route = createFileRoute("/home/factors")({
  component: FactorsPage,
});

function FactorsPage() {
  const navigate = Route.useNavigate();
  const { data: factors = [], isLoading } = useFactorsQuery();
  const createFactor = useCreateFactor();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <VStack gap={4}>
      <HStack gap={3} align="center" style={{ justifyContent: "space-between" }}>
        <Heading level={2}>因子</Heading>
        <Button label="创建因子" variant="primary" onClick={() => setIsCreateOpen(true)} />
      </HStack>

      {isLoading ? (
        <Spinner size="sm" label="加载中..." />
      ) : factors.length === 0 ? (
        <Text type="supporting">暂无因子</Text>
      ) : (
        <List hasDividers>
          {factors.map((factor) => (
            <ListItem
              key={factor.name}
              label={factor.label}
              description={factor.description ?? factor.name}
              endContent={<Badge label={FACTOR_CATEGORY_LABELS[factor.category] ?? factor.category} />}
              onClick={() =>
                navigate({ to: "/home/factors/$factorName", params: { factorName: factor.name } })
              }
            />
          ))}
        </List>
      )}

      <FactorCreateDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={(input) => createFactor.mutate(input)}
      />
    </VStack>
  );
}
