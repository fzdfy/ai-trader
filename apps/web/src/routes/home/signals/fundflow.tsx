import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
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
