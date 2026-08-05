import { useState, useCallback, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Table, proportional } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Card } from "@astryxdesign/core/Card";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MinusIcon, PlusIcon } from "lucide-react";
import { ChipsChart, type ChipPoint } from "../components/charts/ChipsChart";
import { FundFlowChart, type FundFlowDaily } from "../components/charts/FundFlowChart";
import { HeatmapChart, type HeatmapItem } from "../components/charts/HeatmapChart";
import { MetricCard } from "../components/MetricCard";
import { chartDown, chartGain, chartUp } from "../lib/theme";
import {
  useInstrumentsQuery,
  useWatchlistQuery,
  useAddWatchlist,
  useRemoveWatchlist,
} from "../hooks/useInstruments";
import type { Instrument } from "../hooks/useInstruments";
import { useBoardsQuery, type BoardItem } from "../hooks/useBoards";

export const Route = createFileRoute("/market")({
  component: MarketPage,
});

type MarketTab = "boards" | "stocks" | "chips" | "fundflow" | "heatmap";

// ==============================
// Tab 1: 板块 — 行业/概念板块排行
// ==============================

function getStockColumns(
  watchlist: string[],
  onAdd: (s: string) => void,
  onRemove: (s: string) => void,
) {
  // Set 化避免 renderCell 内 O(n) 查找（js-index-maps）
  const watchSet = new Set(watchlist);
  return [
    { key: "symbol" as const, header: "代码", width: proportional(1) },
    { key: "name" as const, header: "名称", width: proportional(1.5) },
    { key: "exchange" as const, header: "交易所", width: proportional(0.8) },
    {
      key: "action" as const,
      header: "操作",
      width: proportional(0.5),
      renderCell: (row: Instrument) => {
        const isWatched = watchSet.has(row.symbol);
        return isWatched ? (
          <IconButton
            icon={<MinusIcon />}
            label="取消自选"
            size="sm"
            variant="ghost"
            onClick={() => onRemove(row.symbol)}
          />
        ) : (
          <IconButton
            icon={<PlusIcon />}
            label="添加自选"
            size="sm"
            variant="ghost"
            onClick={() => onAdd(row.symbol)}
          />
        );
      },
    },
  ];
}

function BoardsTab() {
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
      return <Text style={{ color, fontWeight: 600 }}>{Number.isNaN(v) ? "-" : `${v.toFixed(2)}%`}</Text>;
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

// ==============================
// Tab 2: 个股 — 股票搜索 + 自选管理（原 /sector 内容）
// ==============================

function StocksTab() {
  const [inputValue, setInputValue] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const {
    data: instrumentsData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInstrumentsQuery(searchQ);
  const { data: watchlist = [] } = useWatchlistQuery();
  const addWatchlist = useAddWatchlist();
  const removeWatchlist = useRemoveWatchlist();

  const allInstruments = instrumentsData?.pages.flatMap((p) => p.data) ?? [];

  const handleSearch = useCallback(() => {
    setSearchQ(inputValue);
  }, [inputValue]);

  // 列定义仅在 watchlist 变化时重建（rerender-memo）
  const columns = useMemo(
    () => getStockColumns(watchlist, addWatchlist.mutate, removeWatchlist.mutate),
    [watchlist, addWatchlist.mutate, removeWatchlist.mutate],
  );

  return (
    <VStack gap={3}>
      <HStack gap={2}>
        <TextInput
          label="搜索股票"
          isLabelHidden
          placeholder="输入代码或名称搜索..."
          value={inputValue}
          onChange={setInputValue}
          startIcon="search"
        />
        <Button label="搜索" variant="primary" onClick={handleSearch} />
      </HStack>
      <Table<Instrument>
        idKey="symbol"
        columns={columns}
        data={allInstruments}
        density="compact"
        dividers="rows"
        hasHover
      />
      {hasNextPage && (
        <div style={{ padding: "var(--spacing-2)", textAlign: "center" }}>
          <Button
            label={isFetchingNextPage ? "加载中..." : "加载更多"}
            variant="ghost"
            onClick={() => fetchNextPage()}
            isDisabled={isFetchingNextPage}
          />
        </div>
      )}
      {isFetching && !isFetchingNextPage && <Spinner size="sm" label="加载中..." />}
    </VStack>
  );
}

// ==============================
// Tab 2: 筹码分布
// ==============================

// ==============================
// Tab 2: 筹码分布（个股 / 行业）
// ==============================

interface ChipsResult {
  symbol?: string;
  boardCode?: string;
  currentPrice: number;
  avgCost: number;
  profitRatio: number;
  cost90: { low: number; high: number };
  cost70: { low: number; high: number };
  distribution: ChipPoint[];
}

interface BoardOption {
  code: string;
  name: string;
}

function ChipsTab() {
  const [mode, setMode] = useState<"stock" | "board">("stock");
  const [symbol, setSymbol] = useState("002594.SZ");
  const [boardCode, setBoardCode] = useState("");
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChipsResult | null>(null);

  // 行业模式：拉取行业板块列表（板块名展示用）
  useEffect(() => {
    if (mode !== "board" || boards.length > 0) return;
    fetch("/api/v1/boards?type=industry")
      .then((res) => res.json())
      .then((json) => {
        const list = (json.success ? json.data : []) as BoardOption[];
        setBoards(list);
        if (list.length > 0) setBoardCode(list[0]!.code);
      })
      .catch((error) => console.error("[chips] 行业列表加载失败:", error));
  }, [mode, boards.length]);

  // 点击按钮 → 直接调用接口计算筹码分布
  const load = useCallback(async () => {
    const key = mode === "stock" ? symbol : boardCode;
    if (!key) return;
    setLoading(true);
    setData(null);
    try {
      const endpoint =
        mode === "stock"
          ? `/api/v1/chips?symbol=${encodeURIComponent(key)}&days=250&bins=48`
          : `/api/v1/chips/board?code=${encodeURIComponent(key)}&days=250&bins=48`;
      const res = await fetch(endpoint);
      const json = await res.json();
      setData(json.success ? json.data : null);
    } catch (error) {
      console.error("[chips] 请求失败:", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mode, symbol, boardCode]);

  const metrics = data
    ? [
        { label: "当前价", value: data.currentPrice.toFixed(2) },
        { label: "平均成本", value: data.avgCost.toFixed(2) },
        {
          label: "获利盘",
          value: `${data.profitRatio.toFixed(1)}%`,
          color: chartGain(),
        },
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
            onEnter={() => load()}
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
          onClick={() => load()}
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
            <ChipsChart
              distribution={data.distribution}
              currentPrice={data.currentPrice}
            />
          </Card>
          <Text type="supporting" size="sm">
            绿色 = 获利筹码（价格低于当前价），红色 = 套牢筹码。历史筹码按三角形分布模型估算，仅作参考。
          </Text>
        </>
      )}
    </VStack>
  );
}

// ==============================
// Tab 3: 资金流向
// ==============================

function FundFlowTab() {
  const [symbol, setSymbol] = useState("002594.SZ");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FundFlowDaily[]>([]);

  // 点击按钮 → 直接调用接口加载资金流向
  const load = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoading(true);
    setData([]);
    try {
      const res = await fetch(`/api/v1/fundflow?symbol=${encodeURIComponent(sym)}&period=daily&limit=30`);
      const json = await res.json();
      setData(json.success ? json.data : []);
    } catch (error) {
      console.error("[fundflow] 请求失败:", error);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
          onEnter={() => load(symbol)}
          style={{ width: 160 }}
        />
        <Button
          label={loading ? "加载中..." : "查看资金流"}
          variant="primary"
          isDisabled={!symbol || loading}
          onClick={() => load(symbol)}
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

/** 资金流指标卡：流入红 / 流出绿（A 股资金流向惯例） */
function FlowMetric({ label, value }: { label: string; value: number | null }) {
  const color = value == null ? undefined : value >= 0 ? chartUp() : chartDown();
  return <MetricCard label={label} value={value == null ? "-" : fmtFlow(value)} color={color} />;
}

/** 格式化资金额：亿 / 万 / 元 */
function fmtFlow(v: number | null): string {
  if (v == null) return "-";
  const abs = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}万`;
  return `${sign}${abs.toFixed(0)}`;
}

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

// ==============================
// Tab 5: 热力图（行业 / 概念）
// ==============================

function HeatmapTab() {
  const [heatType, setHeatType] = useState<"industry" | "concept">("industry");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HeatmapItem[]>([]);

  // 切换行业/概念时自动拉取热力图数据（嵌套：板块 + 成分股）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData([]);
    fetch(`/api/v1/heatmap?type=${heatType}&top=200`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const payload = json.success ? json.data : null;
        setData(payload?.data ?? []);
      })
      .catch((error) => {
        if (!cancelled) console.error("[heatmap] 请求失败:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [heatType]);

  return (
    <VStack gap={3}>
      <HStack gap={3} align="center">
        <TabList value={heatType} onChange={(v) => setHeatType(v as "industry" | "concept")}>
          <Tab value="industry" label="行业热力图" />
          <Tab value="concept" label="概念热力图" />
        </TabList>
        {loading && <Spinner size="sm" label="加载中..." />}
      </HStack>

      {data.length > 0 ? (
        <>
          <Card padding={4}>
            <HeatmapChart data={data} />
          </Card>
          <Text type="supporting" size="sm">
            双层热力图：一级 = 板块（面积=总市值），二级 = 成分股（面积=成交额），颜色均按涨跌幅（红涨绿跌）。默认展示涨幅榜前 200 个板块。A 股无官方 GICS 分类，按东财行业/概念分类呈现（GICS 风格热力图）。
          </Text>
        </>
      ) : (
        !loading && <Text type="supporting">暂无热力图数据（上游接口可能暂不可达）</Text>
      )}
    </VStack>
  );
}

// ==============================
// Page
// ==============================

function MarketPage() {
  const [tab, setTab] = useState<MarketTab>("boards");

  return (
    <VStack gap={5}>
      <Heading level={2}>行情</Heading>
      <TabList value={tab} onChange={(v) => setTab(v as MarketTab)}>
        <Tab value="boards" label="板块" />
        <Tab value="stocks" label="个股" />
        <Tab value="chips" label="筹码分布" />
        <Tab value="fundflow" label="资金流向" />
        <Tab value="heatmap" label="热力图" />
      </TabList>

      {tab === "boards" && <BoardsTab />}
      {tab === "stocks" && <StocksTab />}
      {tab === "chips" && <ChipsTab />}
      {tab === "fundflow" && <FundFlowTab />}
      {tab === "heatmap" && <HeatmapTab />}
    </VStack>
  );
}
