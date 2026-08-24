/**
 * 历史复盘详情页 — 回放某交易日复盘。
 *
 * 模块结构固定（代码写死），直接渲染该条记录中快照的 sections（可追溯、可复现）。
 */
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { useReviewQuery } from "../../../../hooks/useReviews";
import { ReviewContent } from "../-private/ReviewContent";
import { formatDateTime } from "../-private/utils";

export const Route = createFileRoute("/home/reviews/history/$date")({
  component: ReviewHistoryDetailPage,
});

function ReviewHistoryDetailPage() {
  const { date } = useParams({ from: "/home/reviews/history/$date" });
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

      <ReviewContent review={review} />
    </VStack>
  );
}
