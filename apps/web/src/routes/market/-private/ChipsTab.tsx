import { useEffect, useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Card } from "@astryxdesign/core/Card";
import { ChipsChart } from "../../../components/charts/ChipsChart";
import { MetricCard } from "./MetricCard";
import { useChipsQuery, useIndustryBoardsQuery } from "../../../hooks/useChips";
import { chartGain } from "../../../lib/theme";

/** Tab 3: 筹码分布（个股 / 行业板块） */
export function ChipsTab() {
  const [mode, setMode] = useState<"stock" | "board">("stock");
  const [symbol, setSymbol] = useState("002594.SZ");
  const [boardCode, setBoardCode] = useState("");
  const [submitted, setSubmitted] = useState("");

  // 行业模式：拉取行业板块列表（下拉框选项），TanStack Query 管理
  const { data: boards = [] } = useIndustryBoardsQuery(mode === "board");
  useEffect(() => {
    const first = boards[0];
    if (mode === "board" && boardCode === "" && first) {
      setBoardCode(first.code);
    }
  }, [mode, boards, boardCode]);

  // 筹码分布查询（点击"计算筹码"提交 key 后触发）
  const chipsKey = submitted;
  const { data, isFetching } = useChipsQuery(mode, chipsKey);
  const loading = isFetching;

  const handleCalc = () => {
    const key = mode === "stock" ? symbol : boardCode;
    if (!key) return;
    setSubmitted(key);
  };

  const metrics = data
    ? [
        { label: "当前价", value: data.currentPrice.toFixed(2) },
        { label: "平均成本", value: data.avgCost.toFixed(2) },
        { label: "获利盘", value: `${data.profitRatio.toFixed(1)}%`, color: chartGain() },
        { label: "90%成本区间", value: `${data.cost90.low.toFixed(2)} ~ ${data.cost90.high.toFixed(2)}` },
        { label: "70%成本区间", value: `${data.cost70.low.toFixed(2)} ~ ${data.cost70.high.toFixed(2)}` },
      ]
    : [];

  return (
    <VStack gap={4}>
      <TabList value={mode} onChange={(v) => setMode(v as "stock" | "board")}>
        <Tab value="stock" label="个股" />
        <Tab value="board" label="行业" />
      </TabList>

      <HStack gap={2} align="end">
        {mode === "stock" ? (
          <TextInput
            label="股票代码"
            placeholder="如 000001.SZ"
            value={symbol}
            onChange={setSymbol}
            onEnter={handleCalc}
            style={{ width: 160 }}
          />
        ) : (
          <VStack gap={1}>
            <Text type="supporting" size="sm">
              行业板块
            </Text>
            <select
              value={boardCode}
              onChange={(e) => setBoardCode(e.target.value)}
              style={{
                height: 36,
                padding: "0 8px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-background-surface)",
                color: "var(--color-text-primary)",
                minWidth: 200,
              }}
            >
              {boards.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </VStack>
        )}
        <Button
          label={loading ? "计算中..." : "计算筹码"}
          variant="primary"
          isDisabled={loading || (mode === "stock" ? !symbol : !boardCode)}
          onClick={handleCalc}
        />
      </HStack>

      {loading && <Spinner size="sm" label="计算筹码分布中..." />}

      {data && (
        <>
          <HStack gap={4} style={{ flexWrap: "wrap" }}>
            {metrics.map((m) => (
              <MetricCard key={m.label} label={m.label} value={m.value} color={m.color} />
            ))}
          </HStack>
          <Card padding={4}>
            <ChipsChart distribution={data.distribution} currentPrice={data.currentPrice} />
          </Card>
          <Text type="supporting" size="sm">
            绿色 = 获利筹码（价格低于当前价），红色 = 套牢筹码。历史筹码按三角形分布模型估算，仅作参考。
          </Text>
        </>
      )}
    </VStack>
  );
}
