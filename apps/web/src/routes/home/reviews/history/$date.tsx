/**
 * 历史复盘详情页 — 回放某交易日复盘。
 *
 * 渲染模块取自该条复盘记录里快照的 skill.sections，
 * 即使当前 skill 已修改，历史复盘仍按生成时的结构展示（可追溯、可复现）。
 */
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { useReviewQuery, useReviewSkillQuery } from "../../../../hooks/useReviews";
import { ReviewContent, sectionsChanged } from "../-private/ReviewContent";
import { formatDateTime } from "../-private/utils";

export const Route = createFileRoute("/home/reviews/history/$date")({
  component: ReviewHistoryDetailPage,
});

function ReviewHistoryDetailPage() {
  const { date } = useParams({ from: "/home/reviews/history/$date" });
  const { data: skill } = useReviewSkillQuery();
  const reviewQuery = useReviewQuery(date);
  const review = reviewQuery.data ?? null;

  if (reviewQuery.isLoading) {
    return <Spinner size="sm" label="加载中..." />;
  }

  if (!review) {
    return <Text type="supporting">该日期暂无复盘。</Text>;
  }

  return (
    <VStack gap={4}>
      <HStack gap={2} align="center">
        <Link to="/home/reviews/history" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
      </HStack>

      <VStack gap={1}>
        <Heading level={2}>{date} 复盘</Heading>
        <Text type="supporting" size="sm">
          更新于 {formatDateTime(review.updatedAt)}
        </Text>
      </VStack>

      <ReviewContent review={review} skillChanged={sectionsChanged(review.skill, skill)} />
    </VStack>
  );
}
