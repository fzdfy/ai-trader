import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { ChipsTab } from "../../market/-private/ChipsTab";

export const Route = createFileRoute("/home/signals/chips")({
  component: ChipsPage,
});

function ChipsPage() {
  return (
    <VStack gap={4}>
      <Heading level={2}>筹码分布</Heading>
      <ChipsTab />
    </VStack>
  );
}
