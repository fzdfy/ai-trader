/**
 * 复盘 Skill 编辑面板 — 仅编辑复盘方法论（instructions）。
 *
 * Skill 由两部分组成：
 *   - instructions：给复盘 agent 的方法论提示词（此处可编辑）
 *   - sections：要求 agent 输出的模块结构（不再手动编辑）
 *
 * UI 模块不再由用户手动配置：生成复盘时 agent 会依据 skill 中要求的模块
 * 与实际数据自动生成 UI，模块无数据时渲染为空数据。已生成的历史复盘仍使用
 * 其生成时的 skill 快照渲染，不受此处修改影响。
 */
import { useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Section } from "@astryxdesign/core/Section";
import { TextArea } from "@astryxdesign/core/TextArea";
import {
  useReviewSkillQuery,
  useUpdateReviewSkill,
  type ReviewSkill,
} from "../../../../hooks/useReviews";

export function ReviewSkillEditor() {
  const { data: skill } = useReviewSkillQuery();
  const saveSkill = useUpdateReviewSkill();

  // 编辑草稿：首次加载时同步一次，避免窗口重取覆盖未保存编辑。
  // 只编辑 instructions，sections 保持原值不变。
  const [draft, setDraft] = useState<ReviewSkill | null>(null);
  const skillLoadedRef = useRef(false);
  useEffect(() => {
    if (skill && !skillLoadedRef.current) {
      setDraft(skill);
      skillLoadedRef.current = true;
    }
  }, [skill]);

  return (
    <Section>
      <VStack gap={3}>
        <Text style={{ fontWeight: 700, fontSize: 16 }}>复盘 Skill</Text>
        <Text type="supporting" size="sm">
          Agent 生成复盘时会动态读取此 Skill，并依据其中要求的方法论与数据自动生成 UI。
        </Text>
        {draft ? (
          <>
            <TextArea
              label="复盘方法论（instructions）"
              value={draft.instructions}
              onChange={(v) => setDraft({ ...draft, instructions: v })}
              rows={8}
              placeholder="描述复盘应遵循的方法论与关注要点..."
            />
            <Button
              label={saveSkill.isPending ? "保存中..." : "保存 Skill"}
              variant="primary"
              isDisabled={saveSkill.isPending}
              onClick={() => saveSkill.mutate(draft)}
            />
            {saveSkill.isSuccess && (
              <Text size="sm" style={{ color: "var(--color-text-positive)" }}>
                已保存，下次生成复盘时将生效
              </Text>
            )}
            {saveSkill.isError && (
              <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
                {(saveSkill.error as Error)?.message ?? "保存失败"}
              </Text>
            )}
          </>
        ) : (
          <Spinner size="sm" label="正在加载 Skill..." />
        )}
      </VStack>
    </Section>
  );
}
