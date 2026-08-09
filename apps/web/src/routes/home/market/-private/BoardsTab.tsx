import { useState } from "react";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { useBoardsQuery, type BoardItem } from "../../../../hooks/useBoards";
import { chartUp, chartDown } from "../../../../lib/theme";

/** 板块排行表列（模块级静态）：红涨绿跌（A 股惯例） */
const boardColumns = [
  { key: "rank" as const, header: "排名", width: proportional(0.6) },
  { key: "code" as const, header: "代码", width: proportional(1) },
  { key: "name" as const, header: "名称", width: proportional(1.5) },
  {
    key: "changePercent" as const,
    header: "涨跌幅",
    width: proportional(1),
    renderCell: (row: BoardItem) => {
      const v = Number.parseFloat(row.changePercent ?? "");
      const color = v > 0 ? chartUp() : v < 0 ? chartDown() : undefined;
      return (
        <Text style={{ color, fontWeight: 600 }}>{Number.isNaN(v) ? "-" : `${v.toFixed(2)}%`}</Text>
      );
    },
  },
  {
    key: "popularity" as const,
    header: "换手率",
    width: proportional(0.8),
    renderCell: (row: BoardItem) =>
      row.popularity ? `${Number.parseFloat(row.popularity).toFixed(2)}%` : "-",
  },
];

/** Tab 1: 板块 — 行业/概念板块排行 */
export function BoardsTab() {
  const [boardType, setBoardType] = useState<"industry" | "concept">("industry");
  const { data: boards = [], isLoading: boardsLoading } = useBoardsQuery(boardType);

  return (
    <VStack gap={3}>
      <TabList value={boardType} onChange={(v) => setBoardType(v as "industry" | "concept")}>
        <Tab value="industry" label="行业板块" />
        <Tab value="concept" label="概念板块" />
      </TabList>
      {boardsLoading ? (
        <Spinner size="sm" label="加载板块排行中..." />
      ) : (
        <Table<BoardItem>
          idKey="code"
          columns={boardColumns}
          data={boards}
          density="compact"
          dividers="rows"
          hasHover
        />
      )}
    </VStack>
  );
}
