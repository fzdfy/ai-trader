import { createFileRoute, redirect } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { legacyMarketRedirect } from "../../../lib/market-center";
import { FundFlowTab } from "./-private/FundFlowTab";

export const Route = createFileRoute("/home/signals/fundflow")({
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  beforeLoad: ({ location }) => {
    const target = legacyMarketRedirect(location.pathname, location.search);
    if (target) throw redirect(target);
  },
  component: FundFlowPage,
});

function FundFlowPage() {
  return (
    <VStack gap={4}>
      <Heading level={2}>资金流向</Heading>
      <FundFlowTab />
    </VStack>
  );
}
