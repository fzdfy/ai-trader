/**
 * 编辑复盘 Skill 页面 — 调整复盘方法论与 UI 模块配置。
 *
 * Skill 由 instructions（方法论提示词）与 sections（UI 模块配置）组成，
 * 保存后即覆盖当前 skill；下次生成复盘时 agent 会动态读取最新 skill。
 * 已生成的历史复盘使用其生成时的 skill 快照渲染，不受此处修改影响。
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
        <Heading level={2}>编辑复盘 Skill</Heading>
        <Text type="supporting">调整复盘方法论与 UI 模块配置，下次生成复盘时生效。</Text>
      </VStack>

      <ReviewSkillEditor />
    </VStack>
  );
}
