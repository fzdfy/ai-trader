import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { HeatmapTab } from "./-private/HeatmapTab";

export const Route = createFileRoute("/home/signals/heatmap")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: (search.tab as string) ?? "industry",
  }),
  component: HeatmapPage,
});

function HeatmapPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <VStack gap={4}>
      <Heading level={2}>热力图</Heading>
      <HeatmapTab
        value={tab as "industry" | "concept"}
        onChange={(v) => navigate({ search: { tab: v }, replace: true })}
      />
    </VStack>
  );
}
