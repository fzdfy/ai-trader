/**
 * Tab 4: 资金流向 — 行业 / 概念 / 个股 资金流排行（查库分页）。
 *
 * 列表资金流字段只展示主力净流入，SQL 分页。
 * 红涨绿跌（A 股惯例）：净流入为正（红），流出为负（绿）。
 */
import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import {
  useFundFlowRankQuery,
  type FundFlowRankRow,
} from "../../../../hooks/useFundFlow";
import { fmtFlow } from "../../../../lib/format";
import { chartDown, chartUp } from "../../../../lib/theme";

type Category = "industry" | "concept" | "stock";

/** Tab 配置（模块级静态） */
const CATEGORIES: { value: Category; label: string }[] = [
  { value: "industry", label: "行业" },
  { value: "concept", label: "概念" },
  { value: "stock", label: "个股" },
];

const PAGE_SIZE = 50;

/** 资金净流入单元格：流入红 / 流出绿（fmtFlow 自带正负号） */
function FlowCell({ value }: { value: number | null }) {
  if (value == null) return <Text type="supporting">-</Text>;
  const color = value >= 0 ? chartUp() : chartDown();
  return <Text style={{ color, fontWeight: 600 }}>{fmtFlow(value)}</Text>;
}

/** 排行列表列：只展示 排名 / 名称 / 主力净流入 */
const COLUMNS = [
  {
    key: "rank",
    header: "#",
    width: proportional(0.5),
    renderCell: (r: FundFlowRankRow) => <Text type="supporting">{r.rank}</Text>,
  },
  { key: "name", header: "名称", width: proportional(2) },
  {
    key: "mainNetInflow",
    header: "主力净流入",
    width: proportional(1.5),
    renderCell: (r: FundFlowRankRow) => <FlowCell value={r.mainNetInflow} />,
  },
];

/** Tab 4: 资金流向（行业 / 概念 / 个股 分页列表） */
export function FundFlowTab() {
  const [category, setCategory] = useState<Category>("industry");
  const [page, setPage] = useState(1);

  const { data, isFetching } = useFundFlowRankQuery(category, page, PAGE_SIZE);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleCategory = (next: Category) => {
    setCategory(next);
    setPage(1);
  };

  return (
    <VStack gap={4}>
      {/* Tab 切换 + 概览 */}
      <HStack gap={2} align="center" style={{ flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <Button
            key={c.value}
            label={c.label}
            variant={category === c.value ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleCategory(c.value)}
          />
        ))}
        <Text type="supporting" size="sm">
          共 {total} 条 · 最新快照资金流排行（红流入 / 绿流出）
        </Text>
      </HStack>

      {/* 排行榜列表 */}
      {isFetching && rows.length === 0 ? (
        <Spinner size="sm" label="加载资金流排行中..." />
      ) : (
        <Table<FundFlowRankRow>
          idKey="code"
          columns={COLUMNS as never}
          data={rows}
          density="compact"
          dividers="rows"
          hasHover
        />
      )}

      {/* 分页控件 */}
      <HStack gap={3} align="center" style={{ justifyContent: "flex-end" }}>
        <Text type="supporting" size="sm">
          第 {page} / {totalPages} 页
        </Text>
        <HStack gap={2}>
          <Button
            label="上一页"
            size="sm"
            variant="secondary"
            isDisabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          />
          <Button
            label="下一页"
            size="sm"
            variant="secondary"
            isDisabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </HStack>
      </HStack>
    </VStack>
  );
}
