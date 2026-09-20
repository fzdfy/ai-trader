/**
 * 今日复盘页 — 生成/查看当日复盘。
 *
 * 生成采用流式：服务端按 skill.sections 顺序逐个推送已就绪模块（结构化模块先行、
 * agent 生成的模块后推、summary 压轴），前端收到即渲染对应模块组件，
 * 不预先渲染占位卡；agent 推理期间仅展示已就绪模块。
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
  useReviewCurrentDateQuery,
  type ReviewSection,
} from "../../../hooks/useReviews";
import { ReviewContent, ReviewSections } from "./-private/ReviewContent";
import { formatDateTime } from "./-private/utils";

export const Route = createFileRoute("/home/reviews/today")({
  component: TodayReviewPage,
});

function TodayReviewPage() {
  // 复盘日期取「最近一个已收盘交易日」（服务端按交易日历计算），而非浏览器自然日
  const currentDateQuery = useReviewCurrentDateQuery();
  const date = currentDateQuery.data ?? null;
  const reviewQuery = useReviewQuery(date);
  const review = reviewQuery.data ?? null;
  const stream = useGenerateReviewStream();

  const isStreaming = stream.status === "streaming";
  // 已就绪的流式模块（跳过未推送的空槽，无占位卡）
  const streamSections = stream.sections.filter((s): s is ReviewSection => s != null);
  const showStream = streamSections.length > 0;

  if (!date) {
    return (
      <VStack gap={6}>
        <VStack gap={1}>
          <Heading level={2}>今日复盘</Heading>
          <Text type="supporting">生成最近一个交易日的复盘，覆盖行业资金流向、主线、选股池与总结。</Text>
        </VStack>
        <Spinner size="sm" label="正在获取最近交易日..." />
      </VStack>
    );
  }

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
          <Button label="查看复盘 Skill" variant="secondary" />
        </Link>
      </HStack>

      {/* 生成 / 重新生成 */}
      <Section>
        <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
          <Button
            label={
              isStreaming ? "生成中..." : showStream ? "刚刚更新" : review ? "重新生成" : "生成复盘"
            }
            variant="primary"
            isDisabled={isStreaming}
            onClick={() => stream.start(date)}
          />
          {!showStream && review && (
            <Text type="supporting" size="sm">
              更新于 {formatDateTime(review.updatedAt)}
            </Text>
          )}
          {isStreaming && (
            <Spinner size="sm" label="正在生成复盘（结构化模块先出，Agent 推理主线/总结中）..." />
          )}
        </HStack>
        {stream.error && (
          <Text style={{ color: "var(--color-text-negative)" }}>{stream.error}</Text>
        )}
      </Section>

      {/* 流式生成：模块就绪即渲染 */}
      {showStream && <ReviewSections sections={streamSections} />}

      {/* 无流式产物时：已有复盘直接渲染 */}
      {!showStream && reviewQuery.isLoading && <Spinner size="sm" label="正在加载复盘..." />}

      {!showStream && !reviewQuery.isLoading && !isStreaming && review && (
        <ReviewContent review={review} />
      )}

      {/* 无数据时：空状态引导 */}
      {!showStream && !reviewQuery.isLoading && !isStreaming && !review && (
        <Section>
          <VStack gap={2} align="start">
            <Text style={{ fontWeight: 600 }}>今日尚未生成复盘</Text>
            <Text type="supporting" size="sm">
              点击上方「生成复盘」，将依次生成资金流向、主线、涨停池、市场情绪、板块异动、连板、选股池与总结。
            </Text>
          </VStack>
        </Section>
      )}
    </VStack>
  );
}
