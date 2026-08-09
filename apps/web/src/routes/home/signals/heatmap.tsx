import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { HeatmapTab } from "../../market/-private/HeatmapTab";

export const Route = createFileRoute("/home/signals/heatmap")({
  component: HeatmapPage,
});

function HeatmapPage() {
  return (
    <VStack gap={4}>
      <Heading level={2}>热力图</Heading>
      <HeatmapTab />
    </VStack>
  );
}
