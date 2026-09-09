/**
 * 复盘方法论展示面板 — 只读展示 instructions（给总结 agent 的方法论提示词）。
 *
 * 复盘方法论已固定（「复盘模块」结构 + 「总结输出要求」），仅作展示，不可在此修改。
 * 已生成的历史复盘使用其生成时快照的 sections 渲染，不受影响。
 */
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Section } from "@astryxdesign/core/Section";
import { useReviewSkillQuery } from "../../../../hooks/useReviews";

export function ReviewSkillViewer() {
  const { data: skill, isLoading } = useReviewSkillQuery();

  return (
    <Section>
      <VStack gap={3}>
        <Text style={{ fontWeight: 700, fontSize: 16 }}>复盘方法论</Text>
        <Text type="supporting" size="sm">
          Agent 生成总结时使用的复盘方法论（模块结构 + 总结输出要求），内容固定，仅作展示。
        </Text>
        {isLoading || !skill ? (
          <Spinner size="sm" label="正在加载 Skill..." />
        ) : (
          <div
            style={{
              background: "var(--color-background-subtle)",
              border: "1px solid var(--color-border)",
              borderLeft: "4px solid var(--color-accent)",
              borderRadius: "var(--radius-md, 8px)",
              padding: "var(--spacing-4)",
            }}
          >
            <Text style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{skill.instructions}</Text>
          </div>
        )}
      </VStack>
    </Section>
  );
}
