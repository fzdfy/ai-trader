import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { QueryKey } from "@tanstack/react-query";
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
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { fetchStrategies } from "../../hooks/useStrategies";
import { fetchFactors } from "../../hooks/useFactors";
import { fetchBoards } from "../../hooks/useBoards";
import { authClient } from "../../lib/auth-client";
import {
  useRunScreen,
  useScreenResult,
  useScreenIndicators,
  type ScreenItem,
  type ScreenResult,
  type RunScreenInput,
  type FactorViz,
} from "../../hooks/useScreens";
import { IndicatorThumbnail } from "../../components/charts/IndicatorThumbnail";
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

type ScopeValue =
  | "all"
  | "industry"
  | "concept"
  | "resultSet"
  | "gain3"
  | "amount1b"
  | "limitUp2";

const SCOPE_OPTIONS: { value: ScopeValue; label: string }[] = [
  { value: "all", label: "全部选股" },
  { value: "industry", label: "行业选股" },
  { value: "concept", label: "板块选股" },
  { value: "resultSet", label: "结果集合" },
  { value: "gain3", label: "涨幅榜(≥3%)" },
  { value: "amount1b", label: "成交额榜(≥10亿)" },
  { value: "limitUp2", label: "百日内涨停(≥2次)" },
];

function isScope(v: unknown): v is ScopeValue {
  return (
    v === "all" ||
    v === "industry" ||
    v === "concept" ||
    v === "resultSet" ||
    v === "gain3" ||
    v === "amount1b" ||
    v === "limitUp2"
  );
}

// URL search 参数：选股的查询条件（作为 useQuery 的缓存键来源）
interface ScreenSearch {
  strategyId: number;
  topN: number;
  scope: ScopeValue;
  boardCodes: string[];
}

/** 结果表列定义（因子得分列依赖因子中文名映射，形态列依赖指标缩略图数据） */
function makeColumns(labelMap: Map<string, string>, indicatorsBySymbol: Map<string, FactorViz[]>) {
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
      width: proportional(0.6),
      renderCell: (row: ScreenRow) => (
        <Link
          to="/home/market/stock/$symbol"
          params={{ symbol: row.symbol }}
          search={{ from: "screens" }}
          style={{ textDecoration: "none" }}
        >
          <VStack gap={0}>
            <Text style={{ fontWeight: 600, color: "var(--color-text-blue)" }}>{row.name}</Text>
            <Text type="supporting" size="sm">
              {row.symbol}
            </Text>
          </VStack>
        </Link>
      ),
    },
    {
      key: "industry" as const,
      header: "行业",
      width: proportional(1),
      renderCell: (row: ScreenRow) =>
        row.industry ? (
          <Tooltip content={row.industry} placement="above" alignment="start">
            <Text size="sm">{row.industry}</Text>
          </Tooltip>
        ) : (
          <Text type="supporting">-</Text>
        ),
    },
    {
      key: "sectors" as const,
      header: "板块",
      width: proportional(1.3),
      renderCell: (row: ScreenRow) => {
        const list = row.sectors ?? [];
        if (list.length === 0) return <Text type="supporting">-</Text>;
        const preview = list.slice(0, 3);
        const total = row.sectorTotal ?? list.length;
        return (
          <Tooltip
            placement="above"
            alignment="start"
            content={
              <Text size="sm" style={{ display: "block", maxWidth: 320 }}>
                {list.join("、")}
              </Text>
            }
          >
            <Text size="sm">
              {preview.join(" · ")}
              {total > preview.length ? ` 等${total}个` : ""}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      key: "indicators" as const,
      header: "形态",
      width: proportional(1.2),
      renderCell: (row: ScreenRow) => {
        const vizzes = indicatorsBySymbol.get(row.symbol);
        if (!vizzes || vizzes.length === 0) return <Text type="supporting">-</Text>;
        return (
          <HStack gap={3} align="start" style={{ flexWrap: "wrap" }}>
            {vizzes.map((viz) => (
              <VStack key={viz.name} gap={0} align="center">
                <IndicatorThumbnail viz={viz} />
                <Text size="sm" type="supporting">
                  {viz.label}
                </Text>
              </VStack>
            ))}
          </HStack>
        );
      },
    },
    {
      key: "close" as const,
      header: "最新价",
      width: proportional(0.8),
      renderCell: (row: ScreenRow) => <Text>{row.close.toFixed(2)}</Text>,
    },
    {
      key: "score" as const,
      header: "综合得分",
      width: proportional(1.2),
      renderCell: (row: ScreenRow) => (
        <HStack gap={2} align="center" style={{ width: "100%" }}>
          <div style={{ flex: 1, minWidth: 80 }}>
            <ProgressBar value={row.score} max={100} label={`${row.name}综合得分`} isLabelHidden />
          </div>
          <Text style={{ width: 42, textAlign: "right", fontWeight: 600 }}>
            {row.score.toFixed(1)}
          </Text>
        </HStack>
      ),
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
  validateSearch: (search: Record<string, unknown>): ScreenSearch => ({
    strategyId: typeof search.strategyId === "number" ? search.strategyId : 0,
    topN: typeof search.topN === "number" ? search.topN : 20,
    scope: isScope(search.scope) ? search.scope : "all",
    boardCodes: Array.isArray(search.boardCodes)
      ? search.boardCodes.filter((x): x is string => typeof x === "string")
      : [],
  }),
  // 选项数据（策略 / 因子 / 行业 / 概念）在 loader 中并行取好：渲染时即为终态，无需 loading 态
  staleTime: 60_000,
  loader: async () => {
    // loader 不在 React 上下文中，用户 id 直接取当前会话
    const { data: session } = await authClient.getSession();
    const userId = session?.user.id ?? "";
    const [strategies, factors, industryBoards, conceptBoards] = await Promise.all([
      fetchStrategies(userId),
      fetchFactors(userId),
      fetchBoards("industry"),
      fetchBoards("concept"),
    ]);
    return { strategies, factors, industryBoards, conceptBoards };
  },
  component: ScreensPage,
});

function ScreensPage() {
  const { strategies, factors, industryBoards, conceptBoards } = Route.useLoaderData();
  const addStockPool = useAddStockPool();

  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // 结果集合等页面本地交互态（不进入 search：集合内容为会话内临时数据）
  const [resultSets, setResultSets] = useState<ResultSet[]>([]);
  const [selectedResultSetIds, setSelectedResultSetIds] = useState<string[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(() => new Set());
  const [setName, setSetName] = useState("");

  const factorLabelMap = useMemo(() => new Map(factors.map((f) => [f.name, f.label])), [factors]);

  const strategyOptions = useMemo(
    () => strategies.map((s) => ({ value: String(s.id), label: s.name })),
    [strategies],
  );

  // 未显式选择策略时默认取第一个「至少含一个有效因子」的策略：仅公开内置因子能被 quant 识别，
  // 否则默认选中后会选出空结果（原先靠 useEffect 回写 search，这里改为渲染期派生，省掉一轮渲染与导航）
  const strategyId = useMemo(() => {
    if (search.strategyId) return search.strategyId;
    const validFactorNames = new Set(factors.filter((f) => f.isPublic).map((f) => f.name));
    const firstValid = strategies.find((s) =>
      (s.configJson?.factors ?? []).some((f) => validFactorNames.has(f.name)),
    );
    return firstValid?.id ?? 0;
  }, [search.strategyId, strategies, factors]);

  // 统一更新 search 参数（表单控件 onChange 都走这里，replace 避免历史堆积）
  const updateSearch = (patch: Partial<ScreenSearch>) => {
    navigate({ search: { ...search, ...patch }, replace: true });
  };

  // queryKey 直接由 search 参数派生：一个查询条件对应一份缓存结果
  const screenQueryKey: QueryKey = useMemo(
    () => ["screen-result", strategyId, search.topN, search.scope, search.boardCodes],
    [strategyId, search],
  );

  // useMutation 执行选股并写入缓存；useQuery 只读缓存（进入页面按 search 恢复上次结果）
  const runScreen = useRunScreen(screenQueryKey);
  const screenResult = useScreenResult(screenQueryKey);
  const screenData = screenResult.data;

  const rows: ScreenRow[] = useMemo(() => {
    const items = screenData?.items ?? [];
    return items.map((item, i) => ({ ...item, rank: i + 1 }));
  }, [screenData]);

  // 选股结果出来后，拉取各标的的指标缩略图序列（按策略因子 + 结果股票池）
  const indicatorSymbols = useMemo(
    () => (screenData?.items ?? []).map((i) => i.symbol),
    [screenData],
  );
  const indicators = useScreenIndicators(strategyId, indicatorSymbols);

  const indicatorsBySymbol = useMemo(() => {
    const map = new Map<string, FactorViz[]>();
    for (const item of indicators.data ?? []) map.set(item.symbol, item.factors);
    return map;
  }, [indicators.data]);

  const columns = useMemo(
    () => makeColumns(factorLabelMap, indicatorsBySymbol),
    [factorLabelMap, indicatorsBySymbol],
  );

  // 当前范围对应的板块选项（行业 / 概念）
  const boardOptions = useMemo(() => {
    const list = search.scope === "industry" ? industryBoards : conceptBoards;
    return list.map((b) => ({ value: b.code, label: b.name }));
  }, [search.scope, industryBoards, conceptBoards]);

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
    getIsAllSelected: () => rows.length > 0 && rows.every((r) => selectedSymbols.has(r.symbol)),
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
    const input: RunScreenInput = {
      strategyId,
      topN: search.topN,
      scope: search.scope,
    };
    if (search.scope === "industry" || search.scope === "concept") {
      input.boardCodes = search.boardCodes;
    } else if (search.scope === "resultSet") {
      const selected = resultSets.filter((r) => selectedResultSetIds.includes(r.id));
      input.symbols = [...new Set(selected.flatMap((r) => r.items.map((i) => i.symbol)))];
    }
    runScreen.mutate(input);
  };

  const handleScopeChange = (v: string) => {
    setSelectedResultSetIds([]);
    updateSearch({ scope: v as ScopeValue, boardCodes: [] });
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
    const source = screenData?.strategy.name ?? "选股";
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
          根据策略的因子组合，对股票池打分并排名；股票池可限定为全部、行业、板块、已保存的结果集合，或涨幅榜、成交额榜、百日内涨停榜等固定阈值范围。
        </Text>
      </VStack>

      <Section>
        <HStack gap={3} align="end" style={{ flexWrap: "wrap" }}>
          <Selector
            label="策略"
            options={strategyOptions}
            value={strategyId ? String(strategyId) : ""}
            onChange={(v) => updateSearch({ strategyId: Number(v) })}
            placeholder="选择策略"
            isDisabled={strategyOptions.length === 0}
            width={240}
          />
          <Selector
            label="股票池范围"
            options={SCOPE_OPTIONS}
            value={search.scope}
            onChange={handleScopeChange}
            width={160}
          />
          {search.scope === "industry" && (
            <MultiSelector
              label="行业"
              options={boardOptions}
              value={search.boardCodes}
              onChange={(v) => updateSearch({ boardCodes: v })}
              placeholder="选择行业（可多选）"
              hasSearch
              hasSelectAll
              hasClear
              width={280}
            />
          )}
          {search.scope === "concept" && (
            <MultiSelector
              label="板块"
              options={boardOptions}
              value={search.boardCodes}
              onChange={(v) => updateSearch({ boardCodes: v })}
              placeholder="选择板块（可多选）"
              hasSearch
              hasSelectAll
              hasClear
              width={280}
            />
          )}
          {search.scope === "resultSet" && (
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
            value={String(search.topN)}
            onChange={(v) => updateSearch({ topN: Number(v) })}
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

      {screenData && (
        <VStack gap={3}>
          <Text type="supporting">
            策略「{screenData.strategy.name}」 · 共 {screenData.total} 只标的参与打分 · 显示前{" "}
            {rows.length} 名
          </Text>
          {rows.length === 0 ? (
            <Text type="supporting">
              股票池中没有可用数据（请调整范围或先在「个股」页面添加自选）
            </Text>
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
                  label={
                    selectedCount > 0 ? `加入结果集合（已选 ${selectedCount} 只）` : "加入结果集合"
                  }
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
              <HStack
                key={rs.id}
                gap={3}
                align="center"
                style={{ justifyContent: "space-between" }}
              >
                <Text>
                  {rs.name} · {rs.items.length} 只标的
                </Text>
                <Button label="删除" variant="ghost" onClick={() => handleDeleteResultSet(rs.id)} />
              </HStack>
            ))}
          </VStack>
        </Section>
      )}
    </VStack>
  );
}
