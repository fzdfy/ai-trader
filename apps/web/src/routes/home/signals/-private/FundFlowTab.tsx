import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Card } from "@astryxdesign/core/Card";
import { FundFlowChart, type FundFlowDaily } from "../../../../components/charts/FundFlowChart";
import { MetricCard } from "./MetricCard";
import { useFundFlowQuery } from "../../../../hooks/useFundFlow";
import { fmtFlow } from "../../../../lib/format";
import { chartDown, chartUp } from "../../../../lib/theme";

/** 资金流明细表列（模块级静态，避免每次渲染重建） */
const flowColumns = [
  { key: "date" as const, header: "日期", width: proportional(1.2) },
  { key: "close" as const, header: "收盘价", width: proportional(0.8) },
  {
    key: "changePercent" as const,
    header: "涨跌幅",
    width: proportional(0.8),
    renderCell: (row: FundFlowDaily) => (
      <Text
        style={{
          color: (row.changePercent ?? 0) >= 0 ? chartUp() : chartDown(),
          fontWeight: 600,
        }}
      >
        {(row.changePercent ?? 0).toFixed(2)}%
      </Text>
    ),
  },
  {
    key: "mainNetInflow" as const,
    header: "主力净流入",
    width: proportional(1),
    renderCell: (row: FundFlowDaily) => fmtFlow(row.mainNetInflow),
  },
  {
    key: "superLargeNetInflow" as const,
    header: "超大单",
    width: proportional(1),
    renderCell: (row: FundFlowDaily) => fmtFlow(row.superLargeNetInflow),
  },
  {
    key: "largeNetInflow" as const,
    header: "大单",
    width: proportional(1),
    renderCell: (row: FundFlowDaily) => fmtFlow(row.largeNetInflow),
  },
  {
    key: "mediumNetInflow" as const,
    header: "中单",
    width: proportional(1),
    renderCell: (row: FundFlowDaily) => fmtFlow(row.mediumNetInflow),
  },
  {
    key: "smallNetInflow" as const,
    header: "小单",
    width: proportional(1),
    renderCell: (row: FundFlowDaily) => fmtFlow(row.smallNetInflow),
  },
];

/** 资金流指标卡：流入红 / 流出绿（A 股资金流向惯例） */
function FlowMetric({ label, value }: { label: string; value: number | null }) {
  const color = value == null ? undefined : value >= 0 ? chartUp() : chartDown();
  return <MetricCard label={label} value={value == null ? "-" : fmtFlow(value)} color={color} />;
}

/** Tab 4: 资金流向 */
export function FundFlowTab() {
  const [symbol, setSymbol] = useState("002594.SZ");
  const [submitted, setSubmitted] = useState("");

  // 资金流向查询（点击"查看资金流"提交 symbol 后触发）
  const { data = [], isFetching } = useFundFlowQuery(submitted);
  const loading = isFetching;

  const handleLoad = () => {
    if (symbol) setSubmitted(symbol);
  };

  // 最新一天汇总（主力净流入等）
  const latest = data[data.length - 1];

  return (
    <VStack gap={4}>
      <HStack gap={2} align="end">
        <TextInput
          label="股票代码"
          placeholder="如 000001.SZ"
          value={symbol}
          onChange={setSymbol}
          onEnter={handleLoad}
          style={{ width: 160 }}
        />
        <Button
          label={loading ? "加载中..." : "查看资金流"}
          variant="primary"
          isDisabled={!symbol || loading}
          onClick={handleLoad}
        />
      </HStack>

      {loading && <Spinner size="sm" label="加载资金流向中..." />}

      {data.length > 0 && (
        <>
          {latest && (
            <HStack gap={4} style={{ flexWrap: "wrap" }}>
              <FlowMetric label="主力净流入" value={latest.mainNetInflow} />
              <FlowMetric label="超大单净流入" value={latest.superLargeNetInflow} />
              <FlowMetric label="大单净流入" value={latest.largeNetInflow} />
              <FlowMetric label="中单净流入" value={latest.mediumNetInflow} />
              <FlowMetric label="小单净流入" value={latest.smallNetInflow} />
            </HStack>
          )}
          <Card padding={4}>
            <FundFlowChart data={data} />
          </Card>
          <Table<FundFlowDaily>
            idKey="date"
            columns={flowColumns}
            data={[...data].reverse()}
            density="compact"
            dividers="rows"
            hasHover
          />
        </>
      )}
      {!loading && data.length === 0 && (
        <Text type="supporting">输入股票代码查询资金流向（数据来自东方财富）</Text>
      )}
    </VStack>
  );
}
