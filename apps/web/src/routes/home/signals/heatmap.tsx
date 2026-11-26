import { createFileRoute, redirect } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { legacyMarketRedirect } from "../../../lib/market-center";
import { HeatmapTab } from "./-private/HeatmapTab";

export const Route = createFileRoute("/home/signals/heatmap")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: (search.tab as string) ?? "industry",
  }),
  beforeLoad: ({ location }) => {
    const target = legacyMarketRedirect(location.pathname, location.search);
    if (target) throw redirect(target);
  },
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
