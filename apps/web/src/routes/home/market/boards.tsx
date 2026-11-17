import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { BoardsTab } from "./-private/BoardsTab";

export const Route = createFileRoute("/home/market/boards")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: (search.tab as string) ?? "industry",
  }),
  component: BoardsPage,
});

function BoardsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <VStack gap={4}>
      <Heading level={2}>板块</Heading>
      <BoardsTab
        value={tab as "industry" | "concept"}
        onChange={(v) => navigate({ search: { tab: v }, replace: true })}
      />
    </VStack>
  );
}
