import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { QueryKey } from "@tanstack/react-query";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Section } from "@astryxdesign/core/Section";
import {
  Table,
  proportional,
  useTableSelection,
  useTableSortable,
  useTableSortableState,
} from "@astryxdesign/core/Table";
import { Selector } from "@astryxdesign/core/Selector";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
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
  type ScreenExclude,
  type RunScreenInput,
  type FactorViz,
} from "../../hooks/useScreens";
import { IndicatorThumbnail } from "../../components/charts/IndicatorThumbnail";
import { useAddStockPool } from "../../hooks/useStockPool";
import { chartUp, chartDown } from "../../lib/theme";

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
  { value: "100", label: "前 100 名" },
];

type ScopeValue = "all" | "industry" | "concept" | "resultSet" | "gain3" | "amount1b" | "limitUp1";

const SCOPE_OPTIONS: { value: ScopeValue; label: string }[] = [
  { value: "all", label: "全部选股" },
  { value: "industry", label: "行业选股" },
  { value: "concept", label: "概念选股" },
  { value: "resultSet", label: "结果集合" },
  { value: "gain3", label: "涨幅榜(≥3%)" },
  { value: "amount1b", label: "成交额榜(≥10亿)" },
  { value: "limitUp1", label: "百日内涨停(≥1次)" },
];

function isScope(v: unknown): v is ScopeValue {
  return SCOPE_OPTIONS.some((o) => o.value === v);
}

// 排除条件（多选）：默认全部选中，即默认排除小市值/亏损/ST/科创板/创业板
const EXCLUDE_OPTIONS: { value: ScreenExclude; label: string }[] = [
  { value: "smallCap", label: "市值 < 100 亿" },
  { value: "loss", label: "市盈亏损" },
  { value: "st", label: "ST 股" },
  { value: "star", label: "科创板" },
  { value: "chinext", label: "创业板" },
];

const ALL_EXCLUDES: ScreenExclude[] = EXCLUDE_OPTIONS.map((o) => o.value);

function isExclude(v: unknown): v is ScreenExclude {
  return EXCLUDE_OPTIONS.some((o) => o.value === v);
}

// 查询条件（策略 / 返回数量 / 股票池范围 / 板块 / 排除条件）：以会话记忆保存，使详情页返回或页内重挂载后条件不丢
const SCREEN_QUERY_KEY = "screens:query:v1";

interface ScreenQueryState {
  strategyId: number;
  topN: number;
  scope: ScopeValue;
  boardCodes: string[];
  excludes: ScreenExclude[];
}

const DEFAULT_QUERY: ScreenQueryState = {
  strategyId: 0,
  topN: 50,
  scope: "all",
  boardCodes: [],
  excludes: ALL_EXCLUDES,
};

/** 读取会话记忆的查询条件；缺省或字段损坏时回落默认值（strategyId 为 0 表示未显式选择策略） */
function readScreenQuery(): ScreenQueryState {
  try {
    const raw = sessionStorage.getItem(SCREEN_QUERY_KEY);
    if (!raw) return DEFAULT_QUERY;
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== "object" || saved === null) return DEFAULT_QUERY;
    const o = saved as Record<string, unknown>;
    return {
      strategyId: typeof o.strategyId === "number" ? o.strategyId : DEFAULT_QUERY.strategyId,
      topN: typeof o.topN === "number" ? o.topN : DEFAULT_QUERY.topN,
      scope: isScope(o.scope) ? o.scope : DEFAULT_QUERY.scope,
      boardCodes: Array.isArray(o.boardCodes)
        ? o.boardCodes.filter((x): x is string => typeof x === "string")
        : DEFAULT_QUERY.boardCodes,
      // 记忆缺失（旧版本）时回落为全部排除；记忆为数组（含清空）时按记忆恢复
      excludes: Array.isArray(o.excludes) ? o.excludes.filter(isExclude) : DEFAULT_QUERY.excludes,
    };
  } catch {
    // 隐私模式下读取会抛异常，视为无记忆
    return DEFAULT_QUERY;
  }
}

/** 写入会话记忆；隐私模式 / 配额超限 / 被禁用时静默忽略 */
function writeScreenQuery(state: ScreenQueryState): void {
  try {
    sessionStorage.setItem(SCREEN_QUERY_KEY, JSON.stringify(state));
  } catch {
    // 忽略写入失败：记忆只是体验优化，不影响功能
  }
}

/** 数值排序比较器：缺失值视为最小（降序时排在末尾） */
function compareNumeric(a: number | null | undefined, b: number | null | undefined): number {
  const av = a ?? Number.NEGATIVE_INFINITY;
  const bv = b ?? Number.NEGATIVE_INFINITY;
  return av === bv ? 0 : av - bv;
}

/** 金额（元）紧凑展示：≥1 亿用「亿」、≥1 万用「万」，保留 2 位小数 */
function formatMoney(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return v.toFixed(2);
}

/** 主力资金净流入 / 成交额（无量纲比值）；成交额缺失或为 0 时返回 null */
function mainInflowRatio(row: ScreenRow): number | null {
  const inflow = row.mainNetInflow;
  const amount = row.amount;
  if (inflow == null || amount == null || amount === 0) return null;
  return inflow / amount;
}

/** 涨跌配色：正红、负绿、零或缺失不著色 */
function pnlColor(v: number): string | undefined {
  if (v > 0) return chartUp();
  if (v < 0) return chartDown();
  return undefined;
}

/** 结果表列定义（因子得分列依赖因子中文名映射，形态列依赖指标缩略图数据） */
function makeColumns(
  labelMap: Map<string, string>,
  indicatorsBySymbol: Map<string, FactorViz[]>,
  rowSymbols: string[],
) {
  return [
    {
      key: "rank" as const,
      header: "排名",
      width: proportional(0.2, { minWidth: 44 }),
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
          // 带上整个选股结果列表，详情页据此做「上一只 / 下一只」左右切换
          search={
            rowSymbols.length > 1
              ? { from: "screens", list: rowSymbols.join(",") }
              : { from: "screens" }
          }
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
      header: "概念",
      width: proportional(1),
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
              <Text
                size="sm"
                color="inherit"
                style={{ display: "block", maxWidth: 320, whiteSpace: "normal" }}
              >
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
      width: proportional(0.8),
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
      key: "changePct" as const,
      header: "涨幅",
      width: proportional(0.6),
      sortable: true,
      renderCell: (row: ScreenRow) => {
        const pct = row.changePct;
        if (pct == null) return <Text type="supporting">-</Text>;
        const color = pnlColor(pct);
        return (
          <Text style={{ color, fontWeight: 600 }} hasTabularNumbers>
            {pct > 0 ? "+" : ""}
            {pct.toFixed(2)}%
          </Text>
        );
      },
    },
    {
      key: "mainNetInflow" as const,
      header: "主力净流入",
      width: proportional(0.6),
      sortable: true,
      renderCell: (row: ScreenRow) => {
        const inflow = row.mainNetInflow;
        const text = formatMoney(inflow);
        if (inflow == null || text == null) return <Text type="supporting">-</Text>;
        const color = pnlColor(inflow);
        return (
          <Text style={{ color, fontWeight: 600 }} hasTabularNumbers>
            {inflow > 0 ? "+" : ""}
            {text}
          </Text>
        );
      },
    },
    {
      key: "amount" as const,
      header: "成交额",
      width: proportional(0.6),
      sortable: true,
      renderCell: (row: ScreenRow) => {
        const text = formatMoney(row.amount);
        return text == null ? (
          <Text type="supporting">-</Text>
        ) : (
          <Text hasTabularNumbers>{text}</Text>
        );
      },
    },
    {
      key: "mainRatio" as const,
      header: "净流入/成交额",
      width: proportional(0.6),
      sortable: true,
      renderCell: (row: ScreenRow) => {
        const ratio = mainInflowRatio(row);
        if (ratio == null) return <Text type="supporting">-</Text>;
        const color = pnlColor(ratio);
        return (
          <Text style={{ color, fontWeight: 600 }} hasTabularNumbers>
            {ratio.toFixed(2)}
          </Text>
        );
      },
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

  // 挂载时读一次会话记忆（sessionStorage 读取 + 解析只做一次），作为查询条件初值
  const [savedQuery] = useState(readScreenQuery);

  // 查询条件（页面本地态）：仅作为 useQuery 的缓存键来源，并同步写入会话记忆
  const [strategyId, setStrategyId] = useState<number>(() => {
    if (savedQuery.strategyId > 0 && strategies.some((s) => s.id === savedQuery.strategyId)) {
      return savedQuery.strategyId;
    }
    // 未显式选择（或记忆中的策略已不存在）时默认第一个「至少含一个公开因子」的策略：
    // 仅公开内置因子能被 quant 识别，否则默认选中后会选出空结果
    const validFactorNames = new Set(factors.filter((f) => f.isPublic).map((f) => f.name));
    const firstValid = strategies.find((s) =>
      (s.configJson?.factors ?? []).some((f) => validFactorNames.has(f.name)),
    );
    return firstValid?.id ?? 0;
  });
  const [topN, setTopN] = useState(savedQuery.topN);
  const [scope, setScope] = useState(savedQuery.scope);
  const [boardCodes, setBoardCodes] = useState(savedQuery.boardCodes);
  const [excludes, setExcludes] = useState<ScreenExclude[]>(savedQuery.excludes);

  // 查询条件变化后写入会话记忆：详情页返回、页内重挂载时据此恢复
  useEffect(() => {
    writeScreenQuery({ strategyId, topN, scope, boardCodes, excludes });
  }, [strategyId, topN, scope, boardCodes, excludes]);

  // 结果集合等页面本地交互态：集合内容为会话内临时数据
  const [resultSets, setResultSets] = useState<ResultSet[]>([]);
  const [selectedResultSetIds, setSelectedResultSetIds] = useState<string[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(() => new Set());
  const [setName, setSetName] = useState("");

  const factorLabelMap = useMemo(() => new Map(factors.map((f) => [f.name, f.label])), [factors]);

  const strategyOptions = useMemo(
    () => strategies.map((s) => ({ value: String(s.id), label: s.name })),
    [strategies],
  );

  // queryKey 由查询条件派生
  const screenQueryKey: QueryKey = useMemo(
    () => ["screen-result", strategyId, topN, scope, boardCodes, excludes],
    [strategyId, topN, scope, boardCodes, excludes],
  );

  const runScreen = useRunScreen(screenQueryKey);
  const screenResult = useScreenResult(screenQueryKey);

  const isRunning = runScreen.isPending;
  const screenData = screenResult.data;

  const rows: ScreenRow[] = useMemo(() => {
    const items = screenData?.items ?? [];
    return items.map((item, i) => ({ ...item, rank: i + 1 }));
  }, [screenData]);

  // 前端排序：涨幅 / 主力净流入 / 成交额 / 净流入占成交额比，均需数值比较器（默认字符串比较会失真）
  const { sortedData, sortConfig } = useTableSortableState<ScreenRow>({
    data: rows,
    comparators: {
      changePct: (a, b) => compareNumeric(a.changePct, b.changePct),
      mainNetInflow: (a, b) => compareNumeric(a.mainNetInflow, b.mainNetInflow),
      amount: (a, b) => compareNumeric(a.amount, b.amount),
      mainRatio: (a, b) => compareNumeric(mainInflowRatio(a), mainInflowRatio(b)),
    },
  });
  const sortable = useTableSortable<ScreenRow>(sortConfig);

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
    () =>
      makeColumns(
        factorLabelMap,
        indicatorsBySymbol,
        rows.map((r) => r.symbol),
      ),
    [factorLabelMap, indicatorsBySymbol, rows],
  );

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
    getIsAllSelected: () => rows.length > 0 && rows.every((r) => selectedSymbols.has(r.symbol)),
    getIsIndeterminate: () => {
      const count = rows.reduce((n, r) => n + (selectedSymbols.has(r.symbol) ? 1 : 0), 0);
      return count > 0 && count < rows.length;
    },
  });

  const tablePlugins = useMemo(() => ({ selection, sort: sortable }), [selection, sortable]);

  const selectedCount = useMemo(
    () => rows.reduce((n, r) => n + (selectedSymbols.has(r.symbol) ? 1 : 0), 0),
    [rows, selectedSymbols],
  );

  const handleRun = () => {
    const input: RunScreenInput = {
      strategyId,
      topN,
      scope,
      excludes,
    };
    if (scope === "industry" || scope === "concept") {
      input.boardCodes = boardCodes;
    } else if (scope === "resultSet") {
      const selected = resultSets.filter((r) => selectedResultSetIds.includes(r.id));
      input.symbols = [...new Set(selected.flatMap((r) => r.items.map((i) => i.symbol)))];
    }
    runScreen.mutate(input);
  };

  const handleScopeChange = (v: string) => {
    setSelectedResultSetIds([]);
    setScope(v as ScopeValue);
    setBoardCodes([]);
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
          根据策略的因子组合，对股票池打分并排名；股票池可限定为全部、行业、概念、已保存的结果集合，或涨幅榜、成交额榜、百日内涨停榜等固定阈值范围。
        </Text>
      </VStack>

      <Section>
        <VStack gap={3}>
          <HStack gap={3} align="end" style={{ flexWrap: "wrap" }}>
            <Selector
              label="策略"
              options={strategyOptions}
              value={strategyId ? String(strategyId) : ""}
              onChange={(v) => setStrategyId(Number(v))}
              placeholder="选择策略"
              isDisabled={strategyOptions.length === 0}
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
                label="概念"
                options={boardOptions}
                value={boardCodes}
                onChange={setBoardCodes}
                placeholder="选择概念（可多选）"
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
              isDisabled={!strategyId || isRunning}
              onClick={handleRun}
            />
          </HStack>
          <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
            <Text type="label">排除</Text>
            <ToggleButtonGroup
              type="multiple"
              value={excludes}
              onChange={(v) => setExcludes(v as ScreenExclude[])}
              label="排除条件"
              size="sm"
            >
              {EXCLUDE_OPTIONS.map((o) => (
                <ToggleButton key={o.value} value={o.value} label={o.label} />
              ))}
            </ToggleButtonGroup>
          </HStack>
        </VStack>
      </Section>

      {isRunning && <Spinner size="sm" label="正在计算因子得分..." />}

      {runScreen.isError && (
        <Text style={{ color: "var(--color-text-negative)" }}>
          选股失败：
          {(runScreen.error as Error)?.message ?? "请稍后重试"}
        </Text>
      )}

      {screenData && (
        <VStack gap={3}>
          <Text type="supporting">
            策略「{screenData.strategy.name}」 · 共 {screenData.total} 只标的参与打分 · 显示前{" "}
            {rows.length} 名
            {screenData.elapsedMs != null && ` · 耗时 ${screenData.elapsedMs.toFixed(0)} ms`}
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
                data={sortedData}
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
