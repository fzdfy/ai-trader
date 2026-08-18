import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Section } from "@astryxdesign/core/Section";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Selector } from "@astryxdesign/core/Selector";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { useStrategiesQuery } from "../../hooks/useStrategies";
import { useFactorsQuery } from "../../hooks/useFactors";
import { useRunScreen, type ScreenItem } from "../../hooks/useScreens";

// 选股结果行：原始结果 + 排名
type ScreenRow = Record<string, unknown> & ScreenItem & { rank: number };

const TOPN_OPTIONS = [
  { value: "10", label: "前 10 名" },
  { value: "20", label: "前 20 名" },
  { value: "50", label: "前 50 名" },
];

/** 结果表列定义（因子得分列依赖因子中文名映射） */
function makeColumns(labelMap: Map<string, string>) {
  return [
    {
      key: "rank" as const,
      header: "排名",
      width: proportional(0.6),
      renderCell: (row: ScreenRow) => (
        <Text
          style={{
            fontWeight: 600,
            color: row.rank <= 3 ? "var(--color-accent)" : undefined,
          }}
        >
          {row.rank}
        </Text>
      ),
    },
    {
      key: "name" as const,
      header: "股票",
      width: proportional(1.6),
      renderCell: (row: ScreenRow) => (
        <VStack gap={0}>
          <Text style={{ fontWeight: 600 }}>{row.name}</Text>
          <Text type="supporting" size="sm">
            {row.symbol}
          </Text>
        </VStack>
      ),
    },
    {
      key: "score" as const,
      header: "综合得分",
      width: proportional(2.2),
      renderCell: (row: ScreenRow) => (
        <HStack gap={2} align="center" style={{ width: "100%" }}>
          <div style={{ flex: 1, minWidth: 80 }}>
            <ProgressBar
              value={row.score}
              max={100}
              label={`${row.name}综合得分`}
              isLabelHidden
            />
          </div>
          <Text style={{ width: 42, textAlign: "right", fontWeight: 600 }}>
            {row.score.toFixed(1)}
          </Text>
        </HStack>
      ),
    },
    {
      key: "close" as const,
      header: "最新价",
      width: proportional(0.8),
      renderCell: (row: ScreenRow) => <Text>{row.close.toFixed(2)}</Text>,
    },
    {
      key: "factorScores" as const,
      header: "因子得分",
      width: proportional(2.4),
      renderCell: (row: ScreenRow) => {
        const entries = Object.entries(row.factorScores ?? {});
        if (entries.length === 0) return <Text type="supporting">-</Text>;
        return (
          <Text size="sm">
            {entries
              .map(([name, score]) => `${labelMap.get(name) ?? name} ${score.toFixed(0)}`)
              .join(" · ")}
          </Text>
        );
      },
    },
  ];
}

export const Route = createFileRoute("/home/screens")({
  component: ScreensPage,
});

function ScreensPage() {
  const { data: strategies = [], isLoading: strategiesLoading } = useStrategiesQuery();
  const { data: factors = [] } = useFactorsQuery();
  const runScreen = useRunScreen();

  const [strategyId, setStrategyId] = useState<string>("");
  const [topN, setTopN] = useState(20);

  // 策略列表加载后默认选中第一个
  useEffect(() => {
    const first = strategies[0];
    if (first && !strategyId) {
      setStrategyId(String(first.id));
    }
  }, [strategies, strategyId]);

  const factorLabelMap = useMemo(
    () => new Map(factors.map((f) => [f.name, f.label])),
    [factors],
  );

  const strategyOptions = useMemo(
    () => strategies.map((s) => ({ value: String(s.id), label: s.name })),
    [strategies],
  );

  const rows: ScreenRow[] = useMemo(() => {
    const items = runScreen.data?.items ?? [];
    return items.map((item, i) => ({ ...item, rank: i + 1 }));
  }, [runScreen.data]);

  const columns = useMemo(() => makeColumns(factorLabelMap), [factorLabelMap]);

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={2}>选股</Heading>
        <Text type="supporting">
          根据策略的因子组合，对股票池打分并排名，选出综合得分最高的标的。
        </Text>
      </VStack>

      <Section>
        <HStack gap={3} align="end" style={{ flexWrap: "wrap" }}>
          <Selector
            label="策略"
            options={strategyOptions}
            value={strategyId}
            onChange={setStrategyId}
            placeholder="选择策略"
            isDisabled={strategiesLoading || strategyOptions.length === 0}
            width={240}
          />
          <Selector
            label="返回数量"
            options={TOPN_OPTIONS}
            value={String(topN)}
            onChange={(v) => setTopN(Number(v))}
            width={140}
          />
          <Button
            label={runScreen.isPending ? "选股中..." : "开始选股"}
            variant="primary"
            isDisabled={!strategyId || runScreen.isPending}
            onClick={() => runScreen.mutate({ strategyId: Number(strategyId), topN })}
          />
        </HStack>
      </Section>

      {runScreen.isPending && <Spinner size="sm" label="正在计算因子得分..." />}

      {runScreen.isError && (
        <Text style={{ color: "var(--color-text-negative)" }}>
          {(runScreen.error as Error)?.message ?? "选股失败，请稍后重试"}
        </Text>
      )}

      {runScreen.data && (
        <VStack gap={3}>
          <Text type="supporting">
            策略「{runScreen.data.strategy.name}」 · 共 {runScreen.data.total} 只标的参与打分 ·
            显示前 {rows.length} 名
          </Text>
          {rows.length === 0 ? (
            <Text type="supporting">股票池中没有可用数据（请先在「个股」页面添加自选）</Text>
          ) : (
            <Table<ScreenRow>
              idKey="symbol"
              columns={columns}
              data={rows}
              density="compact"
              dividers="rows"
              hasHover
            />
          )}
        </VStack>
      )}
    </VStack>
  );
}
