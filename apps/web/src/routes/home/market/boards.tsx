import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { BoardsTab } from "./-private/BoardsTab";

export const Route = createFileRoute("/home/market/boards")({
  component: BoardsPage,
});

function BoardsPage() {
  return (
    <VStack gap={4}>
      <Heading level={2}>板块</Heading>
      <BoardsTab />
    </VStack>
  );
}
