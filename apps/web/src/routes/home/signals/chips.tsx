import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { ChipsTab } from "./-private/ChipsTab";

export const Route = createFileRoute("/home/signals/chips")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: (search.tab as string) ?? "stock",
  }),
  component: ChipsPage,
});

function ChipsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <VStack gap={4}>
      <Heading level={2}>筹码分布</Heading>
      <ChipsTab
        value={tab as "stock" | "board"}
        onChange={(v) => navigate({ search: { tab: v }, replace: true })}
      />
    </VStack>
  );
}
