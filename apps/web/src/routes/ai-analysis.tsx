import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";

export const Route = createFileRoute("/ai-analysis")({
  component: AIAnalysisPage,
});

function AIAnalysisPage() {
  return (
    <VStack gap={4} align="center">
      <Heading level={2}>智能分析</Heading>
      <Text type="supporting">AI 分析模型加载中...</Text>
    </VStack>
  );
}
