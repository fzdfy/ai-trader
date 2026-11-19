/**
 * 复盘方法论页面 — 只读展示复盘方法论（instructions）。
 *
 * 复盘方法论（「复盘模块」结构 + 「总结输出要求」）内容固定，仅作展示，不可修改。
 */
import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { ReviewSkillViewer } from "./-private/ReviewSkillViewer";

export const Route = createFileRoute("/home/reviews/skill")({
  component: ReviewSkillPage,
});

function ReviewSkillPage() {
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>复盘方法论</Heading>
        <Text type="supporting">
          复盘方法论（模块结构 + 总结输出要求）内容固定，仅作展示，不可修改。
        </Text>
      </VStack>

      <ReviewSkillViewer />
    </VStack>
  );
}
