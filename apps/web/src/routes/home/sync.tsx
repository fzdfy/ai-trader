import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { SyncCenterTab } from "./-private/SyncCenterTab";

export const Route = createFileRoute("/home/sync")({
  component: SyncPage,
});

function SyncPage() {
  return (
    <VStack gap={4}>
      <Heading level={2}>同步中心</Heading>
      <SyncCenterTab />
    </VStack>
  );
}
