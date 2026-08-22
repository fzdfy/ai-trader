/**
 * 今日复盘页 — 生成/查看当日复盘。
 *
 * 生成采用流式（SSE 分节渐进）：点击「生成」后，服务端先推结构化模块
 * （行业资金流/选股池），agent 生成的模块（主线/总结）随后补推，前端
 * 通过 ReviewSections 边生成边渲染，无需等全量返回。
 *
 * 已有复盘（历史生成结果）则直接渲染；无数据时提示并引导生成。
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Section } from "@astryxdesign/core/Section";
import {
  useGenerateReviewStream,
  useReviewQuery,
  useReviewSkillQuery,
} from "../../../hooks/useReviews";
import { ReviewContent, ReviewSections, sectionsChanged } from "./-private/ReviewContent";
import { today, formatDateTime } from "./-private/utils";

export const Route = createFileRoute("/home/reviews/today")({
  component: TodayReviewPage,
});

function TodayReviewPage() {
  const date = today();
  const { data: skill } = useReviewSkillQuery();
  const reviewQuery = useReviewQuery(date);
  const review = reviewQuery.data ?? null;
  const stream = useGenerateReviewStream();

  const isStreaming = stream.status === "streaming";
  // 一旦有流式产物（含生成中/刚完成），就以流式 sections 渐进渲染
  const showStreamSections = stream.sections.length > 0;

  return (
    <VStack gap={6}>
      <HStack gap={3} align="center" style={{ justifyContent: "space-between" }}>
        <VStack gap={1}>
          <Heading level={2}>今日复盘</Heading>
          <Text type="supporting">
            {date} · 生成当日复盘，覆盖行业资金流向、主线、选股池与总结。
          </Text>
        </VStack>
        <Link to="/home/reviews/skill" style={{ textDecoration: "none" }}>
          <Button label="编辑复盘 Skill" variant="secondary" />
        </Link>
      </HStack>

      {/* 生成 / 重新生成 */}
      <Section>
        <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
          <Button
            label={isStreaming ? "生成中..." : review ? "重新生成" : "生成复盘"}
            variant="primary"
            isDisabled={isStreaming}
            onClick={() => stream.start(date)}
          />
          {!showStreamSections && review && (
            <Text type="supporting" size="sm">
              更新于 {formatDateTime(review.updatedAt)}
            </Text>
          )}
          {showStreamSections && (
            <Text type="supporting" size="sm">
              {isStreaming ? "正在生成…" : "刚刚更新"}
            </Text>
          )}
        </HStack>
        {stream.error && (
          <Text style={{ color: "var(--color-text-negative)" }}>{stream.error}</Text>
        )}
      </Section>

      {/* 流式生成中的渐进渲染 */}
      {showStreamSections && <ReviewSections sections={stream.sections} />}

      {/* 已有复盘（非流式）渲染 */}
      {!showStreamSections && reviewQuery.isLoading && <Spinner size="sm" label="正在加载复盘..." />}

      {!showStreamSections && !reviewQuery.isLoading && review && (
        <ReviewContent review={review} skillChanged={sectionsChanged(review.skill, skill)} />
      )}

      {!showStreamSections && !reviewQuery.isLoading && !review && (
        <Section>
          <VStack gap={2} align="start">
            <Text style={{ fontWeight: 600 }}>今日尚未生成复盘</Text>
            <Text type="supporting" size="sm">
              点击上方「生成复盘」，Agent 将结合行业资金流向与选股池生成当日复盘。
            </Text>
          </VStack>
        </Section>
      )}
    </VStack>
  );
}
