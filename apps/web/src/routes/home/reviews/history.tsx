/**
 * 历史复盘列表页 — 展示所有已生成的复盘日期，点击进入详情。
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import { useReviewListQuery, type ReviewListItem } from "../../../hooks/useReviews";
import { formatDateTime } from "./-private/utils";

type HistoryRow = Record<string, unknown> & ReviewListItem;

const HISTORY_COLUMNS = [
  {
    key: "date",
    header: "日期",
    width: proportional(1),
    renderCell: (row: HistoryRow) => (
      <Link
        to="/home/reviews/history/$date"
        params={{ date: row.date }}
        style={{ textDecoration: "none" }}
      >
        <Text style={{ color: "var(--color-text-accent)", fontWeight: 600 }}>{row.date}</Text>
      </Link>
    ),
  },
  {
    key: "summary",
    header: "摘要",
    width: proportional(3),
    renderCell: (row: HistoryRow) => <Text>{row.summary || "-"}</Text>,
  },
  {
    key: "updatedAt",
    header: "更新时间",
    width: proportional(1),
    renderCell: (row: HistoryRow) => (
      <Text type="supporting" size="sm">
        {formatDateTime(row.updatedAt)}
      </Text>
    ),
  },
];

export const Route = createFileRoute("/home/reviews/history")({
  component: ReviewHistoryPage,
});

function ReviewHistoryPage() {
  const { data: reviewList = [], isLoading } = useReviewListQuery();

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2}>历史复盘</Heading>
        <Text type="supporting">已生成的复盘按日期归档，点击日期查看详情。</Text>
      </VStack>

      {isLoading ? (
        <Spinner size="sm" label="加载中..." />
      ) : reviewList.length === 0 ? (
        <Text type="supporting">暂无历史复盘，请先到「今日复盘」生成。</Text>
      ) : (
        <Table<HistoryRow>
          idKey="date"
          columns={HISTORY_COLUMNS}
          data={reviewList as HistoryRow[]}
          density="balanced"
          dividers="rows"
          hasHover
          textOverflow="truncate"
        />
      )}
    </VStack>
  );
}
