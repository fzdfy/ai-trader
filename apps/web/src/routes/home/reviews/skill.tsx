/**
 * 复盘方法论页面 — 只读展示复盘方法论（instructions）。
 *
 * 复盘方法论（「复盘模块」结构 + 「总结输出要求」）内容固定，仅作展示，不可修改。
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { ReviewSkillViewer } from "./-private/ReviewSkillViewer";

export const Route = createFileRoute("/home/reviews/skill")({
  component: ReviewSkillPage,
});

function ReviewSkillPage() {
  return (
    <VStack gap={4}>
      <HStack gap={2} align="center">
        <Link to="/home/reviews/today" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
      </HStack>

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
