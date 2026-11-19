/**
 * 历史复盘详情页 — 回放某交易日复盘。
 *
 * 模块结构固定（代码写死），直接渲染该条记录中快照的 sections（可追溯、可复现）。
 */
import { createFileRoute, useParams } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { Spinner } from "@preline-ui/Spinner";
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
