import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Section } from "@astryxdesign/core/Section";
import { Table, proportional, useTableSelection } from "@astryxdesign/core/Table";
import { Selector } from "@astryxdesign/core/Selector";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { useStrategiesQuery } from "../../hooks/useStrategies";
import { useFactorsQuery } from "../../hooks/useFactors";
import { useBoardsQuery } from "../../hooks/useBoards";
import {
  useRunScreen,
  type ScreenItem,
  type RunScreenInput,
} from "../../hooks/useScreens";
import { useAddStockPool } from "../../hooks/useStockPool";

// 选股结果行：原始结果 + 排名
type ScreenRow = Record<string, unknown> & ScreenItem & { rank: number };

// 前端内存结果集合（勾选的选股结果，可再次作为筛选范围）
interface ResultSet {
  id: string;
  name: string;
  items: ScreenItem[];
}

const TOPN_OPTIONS = [
  { value: "10", label: "前 10 名" },
  { value: "20", label: "前 20 名" },
  { value: "50", label: "前 50 名" },
];

type ScopeValue = "all" | "industry" | "concept" | "resultSet";

const SCOPE_OPTIONS: { value: ScopeValue; label: string }[] = [
  { value: "all", label: "全部选股" },
  { value: "industry", label: "行业选股" },
  { value: "concept", label: "板块选股" },
  { value: "resultSet", label: "结果集合" },
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
  const { data: industryBoards = [] } = useBoardsQuery("industry");
  const { data: conceptBoards = [] } = useBoardsQuery("concept");
  const runScreen = useRunScreen();
  const addStockPool = useAddStockPool();

  const [strategyId, setStrategyId] = useState("");
  const [topN, setTopN] = useState(20);
  const [scope, setScope] = useState<ScopeValue>("all");
  const [boardCodes, setBoardCodes] = useState<string[]>([]);
  const [selectedResultSetIds, setSelectedResultSetIds] = useState<string[]>([]);
  const [resultSets, setResultSets] = useState<ResultSet[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(() => new Set());
  const [setName, setSetName] = useState("");

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

  // 当前范围对应的板块选项（行业 / 概念）
  const boardOptions = useMemo(() => {
    const list = scope === "industry" ? industryBoards : conceptBoards;
    return list.map((b) => ({ value: b.code, label: b.name }));
  }, [scope, industryBoards, conceptBoards]);

  const resultSetOptions = useMemo(
    () =>
      resultSets.map((rs) => ({
        value: rs.id,
        label: `${rs.name}（${rs.items.length} 只）`,
      })),
    [resultSets],
  );

  // 结果表勾选插件（用于把选股结果多选加入集合）
  const selection = useTableSelection<ScreenRow>({
    getIsItemSelected: (item) => selectedSymbols.has(item.symbol),
    onSelectItem: ({ item, isSelected }) => {
      setSelectedSymbols((prev) => {
        const next = new Set(prev);
        if (isSelected) next.add(item.symbol);
        else next.delete(item.symbol);
        return next;
      });
    },
    onSelectAll: ({ isAllSelected }) => {
      setSelectedSymbols(isAllSelected ? new Set(rows.map((r) => r.symbol)) : new Set());
    },
    getIsAllSelected: () =>
      rows.length > 0 && rows.every((r) => selectedSymbols.has(r.symbol)),
    getIsIndeterminate: () => {
      const count = rows.reduce((n, r) => n + (selectedSymbols.has(r.symbol) ? 1 : 0), 0);
      return count > 0 && count < rows.length;
    },
  });

  const tablePlugins = useMemo(() => ({ selection }), [selection]);

  const selectedCount = useMemo(
    () => rows.reduce((n, r) => n + (selectedSymbols.has(r.symbol) ? 1 : 0), 0),
    [rows, selectedSymbols],
  );

  const handleRun = () => {
    const input: RunScreenInput = { strategyId: Number(strategyId), topN, scope };
    if (scope === "industry" || scope === "concept") {
      input.boardCodes = boardCodes;
    } else if (scope === "resultSet") {
      const selected = resultSets.filter((r) => selectedResultSetIds.includes(r.id));
      input.symbols = [...new Set(selected.flatMap((r) => r.items.map((i) => i.symbol)))];
    }
    runScreen.mutate(input);
  };

  const handleScopeChange = (v: string) => {
    setScope(v as ScopeValue);
    setBoardCodes([]);
    setSelectedResultSetIds([]);
  };

  const handleAddToResultSet = () => {
    const selected = rows.filter((r) => selectedSymbols.has(r.symbol));
    if (selected.length === 0) return;
    const items: ScreenItem[] = selected.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      score: r.score,
      close: r.close,
      factorScores: r.factorScores,
    }));
    const name = setName.trim() || `结果集合 ${resultSets.length + 1}`;
    setResultSets((prev) => [...prev, { id: crypto.randomUUID(), name, items }]);
    setSetName("");
    setSelectedSymbols(new Set());
  };

  const handleDeleteResultSet = (id: string) => {
    setResultSets((prev) => prev.filter((r) => r.id !== id));
    setSelectedResultSetIds((prev) => prev.filter((x) => x !== id));
  };

  // 加入选股池（落库，支持按日回放；区别于前端内存的"结果集合"）
  const handleAddToStockPool = () => {
    const selected = rows.filter((r) => selectedSymbols.has(r.symbol));
    if (selected.length === 0) return;
    const source = runScreen.data?.strategy.name ?? "选股";
    addStockPool.mutate(
      {
        items: selected.map((r) => ({
          symbol: r.symbol,
          name: r.name,
          source,
          score: r.score.toFixed(1),
        })),
      },
      { onSuccess: () => setSelectedSymbols(new Set()) },
    );
  };

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={2}>选股</Heading>
        <Text type="supporting">
          根据策略的因子组合，对股票池打分并排名；股票池可限定为全部、行业、板块或已保存的结果集合。
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
            label="股票池范围"
            options={SCOPE_OPTIONS}
            value={scope}
            onChange={handleScopeChange}
            width={160}
          />
          {scope === "industry" && (
            <MultiSelector
              label="行业"
              options={boardOptions}
              value={boardCodes}
              onChange={setBoardCodes}
              placeholder="选择行业（可多选）"
              hasSearch
              hasSelectAll
              hasClear
              width={280}
            />
          )}
          {scope === "concept" && (
            <MultiSelector
              label="板块"
              options={boardOptions}
              value={boardCodes}
              onChange={setBoardCodes}
              placeholder="选择板块（可多选）"
              hasSearch
              hasSelectAll
              hasClear
              width={280}
            />
          )}
          {scope === "resultSet" && (
            <MultiSelector
              label="结果集合"
              options={resultSetOptions}
              value={selectedResultSetIds}
              onChange={setSelectedResultSetIds}
              placeholder={resultSets.length === 0 ? "暂无结果集合" : "选择结果集合（可多选）"}
              isDisabled={resultSets.length === 0}
              hasSelectAll
              hasClear
              width={280}
            />
          )}
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
            onClick={handleRun}
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
            <Text type="supporting">股票池中没有可用数据（请调整范围或先在「个股」页面添加自选）</Text>
          ) : (
            <VStack gap={3}>
              <HStack gap={3} align="end" style={{ flexWrap: "wrap" }}>
                <TextInput
                  label="集合名称"
                  value={setName}
                  onChange={(v) => setSetName(v)}
                  placeholder="留空则自动命名"
                  width={200}
                />
                <Button
                  label={selectedCount > 0 ? `加入结果集合（已选 ${selectedCount} 只）` : "加入结果集合"}
                  variant="secondary"
                  isDisabled={selectedCount === 0}
                  onClick={handleAddToResultSet}
                />
                <Button
                  label={
                    addStockPool.isPending
                      ? "加入中..."
                      : selectedCount > 0
                        ? `加入选股池（已选 ${selectedCount} 只）`
                        : "加入选股池"
                  }
                  variant="primary"
                  isDisabled={selectedCount === 0 || addStockPool.isPending}
                  onClick={handleAddToStockPool}
                />
                {addStockPool.isSuccess && (
                  <Text size="sm" style={{ color: "var(--color-text-positive)" }}>
                    已加入 {addStockPool.data?.count ?? selectedCount} 只到选股池
                  </Text>
                )}
                {addStockPool.isError && (
                  <Text size="sm" style={{ color: "var(--color-text-negative)" }}>
                    {(addStockPool.error as Error)?.message ?? "加入选股池失败"}
                  </Text>
                )}
              </HStack>
              <Table<ScreenRow>
                idKey="symbol"
                columns={columns}
                data={rows}
                density="compact"
                dividers="rows"
                hasHover
                plugins={tablePlugins}
              />
            </VStack>
          )}
        </VStack>
      )}

      {resultSets.length > 0 && (
        <Section>
          <VStack gap={3}>
            <Text style={{ fontWeight: 600 }}>已保存的结果集合</Text>
            {resultSets.map((rs) => (
              <HStack key={rs.id} gap={3} align="center" style={{ justifyContent: "space-between" }}>
                <Text>
                  {rs.name} · {rs.items.length} 只标的
                </Text>
                <Button
                  label="删除"
                  variant="ghost"
                  onClick={() => handleDeleteResultSet(rs.id)}
                />
              </HStack>
            ))}
          </VStack>
        </Section>
      )}
    </VStack>
  );
}
