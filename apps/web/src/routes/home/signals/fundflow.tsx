import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { FundFlowTab } from "./-private/FundFlowTab";

export const Route = createFileRoute("/home/signals/fundflow")({
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
