import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";

export const Route = createFileRoute("/news")({
  component: NewsPage,
});

function NewsPage() {
  return (
    <VStack gap={4} align="center" style={{ padding: "var(--spacing-10)" }}>
      <Heading level={2}>新闻</Heading>
      <Text type="supporting">A 股资讯模块开发中...</Text>
    </VStack>
  );
}
