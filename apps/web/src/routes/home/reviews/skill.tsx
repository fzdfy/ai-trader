/**
 * 编辑复盘方法论页面。
 *
 * 复盘模块结构固定（代码写死），此处仅编辑给总结 agent 的方法论提示词
 * （instructions）。保存后下次生成复盘时 agent 会动态读取最新方法论。
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { ReviewSkillEditor } from "./-private/ReviewSkillEditor";

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
        <Heading level={2}>编辑复盘方法论</Heading>
        <Text type="supporting">调整复盘方法论（instructions），下次生成复盘时生效。</Text>
      </VStack>

      <ReviewSkillEditor />
    </VStack>
  );
}
