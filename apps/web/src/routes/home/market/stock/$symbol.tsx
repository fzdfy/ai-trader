import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useParams, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { VStack, HStack } from "@preline-ui/Stack";
import { Button } from "@preline-ui/Button";
import { Text } from "@preline-ui/Text";
import { TabList, Tab } from "@preline-ui/TabList";
import {
  init,
  dispose,
  type Chart,
  type Coordinate,
  type Crosshair,
  type IndicatorFigure,
  type IndicatorFigureStyle,
  type KLineData,
  type OverlayTemplate,
  type Period,
  registerOverlay,
} from "klinecharts";
import type { KlineTf } from "../../../../hooks/useInstruments";
import {
  useFundFlowHistory,
  useLatestQuotes,
  type FundFlowHistoryRow,
  type LatestQuote,
} from "../../../../hooks/useMarketCenter";
import {
  klineRequestSignal,
  resolveKlineStatus,
  type KlineLoadStatus,
} from "../../../../lib/kline-status";
import {
  KLINE_MA_PERIODS,
  summarizeKlineAt,
  summarizeLatestKline,
  type LatestKlineSummary,
} from "../../../../lib/kline-summary";
import {
  quoteCanvasChartStyles,
  readQuoteCanvasColors,
  type QuoteCanvasColors,
} from "../../../../lib/quote-canvas-theme";
import { toStockReturnSearch } from "../../../../lib/stock-list-state";
import { FundStructure } from "../-private/FundStructure";
import { MarketCenterShell } from "../-private/MarketCenterShell";
import { KlineStatusOverlay } from "./-private/KlineStatusOverlay";
import {
  useTechnicalSignalSnapshot,
  type StoredTechnicalSignalSnapshot,
} from "../../../../hooks/useTechnicalSignals";
import { displaySignalName } from "../../../../components/signals/SignalDiagnosis";
import { buildStockForecastOverlay } from "../../../../lib/stock-forecast-overlay";
import { useStockForecastQuery } from "../../../../hooks/useStockForecast";
import {
  parseStockWorkspaceSearch,
  shouldLoadStockResearch,
  stockWorkspaceSearch,
  type StockWorkspaceSearch,
  type StockWorkspaceMode,
} from "../../../../lib/stock-workspace";
import { StockResearchPanel } from "./-private/StockResearchPanel";
import {
  StockWorkspaceHeader,
  type StockWorkspaceStatusItem,
} from "./-private/StockWorkspaceHeader";

export const Route = createFileRoute("/home/market/stock/$symbol")({
  validateSearch: (search: Record<string, unknown>): StockWorkspaceSearch =>
    parseStockWorkspaceSearch(search),
  component: StockDetailPage,
});

/** MACD 指标单根计算结果 */
type MacdResult = { macd?: number };

/**
 * MACD 指标 figures 覆盖：内置柱体在 MACD 放大时绘制为空心(stroke)、
 * 缩小时实心(fill)，这里统一强制为红涨绿跌实心。
 */
function macdFigures(colors: QuoteCanvasColors): IndicatorFigure[] {
  return [
    { key: "dif", title: "DIF: ", type: "line" },
    { key: "dea", title: "DEA: ", type: "line" },
    {
      key: "macd",
      title: "MACD: ",
      type: "bar",
      baseValue: 0,
      styles: ({ data }) => {
        const currentMacd =
          (data.current as MacdResult | null | undefined)?.macd ?? Number.MIN_SAFE_INTEGER;
        const color = currentMacd > 0 ? colors.up : currentMacd < 0 ? colors.down : colors.flat;
        return { style: "fill", color, borderColor: color } as unknown as IndicatorFigureStyle;
      },
    },
  ];
}

/** 周期选项：一份表同时用于 tf → period 正查与 period → tf 反查 */
const PERIOD_OPTIONS: { value: KlineTf; label: string; period: Period }[] = [
  { value: "1m", label: "分时", period: { span: 1, type: "minute" } },
  { value: "1d", label: "日", period: { span: 1, type: "day" } },
  { value: "5d", label: "5日", period: { span: 5, type: "day" } },
  { value: "1w", label: "周", period: { span: 1, type: "week" } },
  { value: "1mo", label: "月", period: { span: 1, type: "month" } },
];

const DEFAULT_PERIOD: Period = { span: 1, type: "day" };

interface StockForecastOverlayExtendData {
  size: number;
  color: string;
  bandColor: string;
}

const stockForecastOverlayTemplate: OverlayTemplate<StockForecastOverlayExtendData> = {
  name: "stock-forecast-projection",
  totalStep: 0,
  createPointFigures: ({ coordinates, overlay }) => {
    const { size, color, bandColor } = overlay.extendData;
    const upper = coordinates.slice(0, size) as Coordinate[];
    const lower = coordinates.slice(size, size * 2) as Coordinate[];
    const median = coordinates.slice(size * 2) as Coordinate[];
    return [
      {
        type: "polygon",
        attrs: { coordinates: [...upper, ...lower.toReversed()] },
        styles: {
          style: "fill",
          color: bandColor,
          borderColor: color,
          borderSize: 1,
        },
        ignoreEvent: true,
      },
      {
        type: "line",
        attrs: { coordinates: median },
        styles: {
          style: "solid",
          color,
          size: 2,
          dashedValue: [],
        },
        ignoreEvent: true,
      },
      ...median.map((coordinate) => ({
        type: "circle",
        attrs: { x: coordinate.x, y: coordinate.y, r: 2.5 },
        styles: { style: "fill", color },
        ignoreEvent: true,
      })),
    ];
  },
};

registerOverlay(stockForecastOverlayTemplate);

function periodForTf(tf: KlineTf): Period {
  return PERIOD_OPTIONS.find((p) => p.value === tf)?.period ?? DEFAULT_PERIOD;
}

/** klinecharts period → tf 反查：数据加载回调里据此决定请求哪个周期 */
function tfForPeriod(period: Period): KlineTf {
  return (
    PERIOD_OPTIONS.find((p) => p.period.type === period.type && p.period.span === period.span)
      ?.value ?? "1d"
  );
}

function formatKlineDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function formatKlineVolume(volume: number | undefined): string {
  if (volume == null || !Number.isFinite(volume)) return "—";
  if (volume >= 100_000_000) return `${(volume / 100_000_000).toFixed(2)}亿`;
  if (volume >= 10_000) return `${(volume / 10_000).toFixed(2)}万`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(3)}K`;
  return String(volume);
}

function formatKlineAmount(amount: number | undefined): string {
  return amount == null || !Number.isFinite(amount) ? "—" : formatQuoteAmount(String(amount));
}

function formatQuoteAmount(value: string | null): string {
  const amount = value == null ? Number.NaN : Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(2)}亿`;
  if (amount >= 10_000) return `${(amount / 10_000).toFixed(2)}万`;
  return amount.toFixed(0);
}

/**
 * K 线数据查询（TanStack Query 托管），key = ["kline", symbol, tf]。
 * 缓存、并发去重、过期策略全部交给全局共享的 QueryClient：
 * - 左右切换标的 / 切换周期命中缓存即不再请求（原手写 LRU + in-flight 表的职责）；
 * - setSymbol 与 setPeriod 同帧触发的同 key 请求自动合并成一次。
 * 日内(1m)数据变动频繁，新鲜期缩短；日线及以上由定时任务落库，放宽到 5 分钟。
 */
const KLINE_STALE_TIME_INTRADAY = 30_000;
const KLINE_STALE_TIME_EOD = 5 * 60_000;
/** 详情页走命令式 fetchQuery 取数、没有订阅者，默认 5 分钟 GC 会过早回收缓存，故延长 */
const KLINE_GC_TIME = 30 * 60_000;

function klineBarsQueryOptions(symbol: string, tf: KlineTf) {
  return {
    queryKey: ["kline", symbol, tf],
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<KLineData[]> => {
      const params = new URLSearchParams({ symbol, tf });
      const res = await fetch(`/api/v1/kline?${params}`, {
        signal: klineRequestSignal(signal),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: Array<Record<string, unknown>>;
      };
      if (!res.ok || !json.success) {
        throw new Error(`K 线读取失败（${res.status}）`);
      }
      const rows = json.data ?? [];
      return rows
        .filter((k) => k.time)
        .map((k) => ({
          timestamp: new Date(k.time as string).getTime(),
          open: Number.parseFloat(k.open as string),
          high: Number.parseFloat(k.high as string),
          low: Number.parseFloat(k.low as string),
          close: Number.parseFloat(k.close as string),
          volume: Number.parseFloat(k.volume as string),
          turnover:
            k.amount == null || !Number.isFinite(Number(k.amount)) ? undefined : Number(k.amount),
        }))
        .toSorted((a, b) => a.timestamp - b.timestamp);
    },
    staleTime: tf === "1m" ? KLINE_STALE_TIME_INTRADAY : KLINE_STALE_TIME_EOD,
    gcTime: KLINE_GC_TIME,
  };
}

/** 标的基本信息变动极少，名称缓存 10 分钟 */
const INSTRUMENT_STALE_TIME = 10 * 60_000;

/**
 * 标的名称查询（key = ["instrument", symbol]）：图表标题需展示中文名，
 * 而 K 线接口只返回行情。任一失败（未收录/网络异常）返回 null，由调用方回退为代码。
 */
function instrumentNameQueryOptions(symbol: string) {
  return {
    queryKey: ["instrument", symbol],
    queryFn: async (): Promise<string | null> => {
      const res = await fetch(`/api/v1/instruments/${encodeURIComponent(symbol)}`);
      if (!res.ok) return null;
      const json = (await res.json()) as {
        success?: boolean;
        data?: { name?: string | null };
      };
      const name = json.success ? json.data?.name : null;
      return typeof name === "string" && name.length > 0 ? name : null;
    },
    staleTime: INSTRUMENT_STALE_TIME,
    gcTime: KLINE_GC_TIME,
  };
}

function compactSparkline(bars: KLineData[], width = 168, height = 54): string {
  if (bars.length < 2) return "";
  const closes = bars.slice(-36).map((bar) => bar.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  return closes
    .map((close, index) => {
      const x = (index / (closes.length - 1)) * width;
      const y = height - ((close - min) / range) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function ResearchMarketContext({
  bars,
  quote,
  fund,
  technical,
  isKlineLoading,
  isKlineError,
  onQuick,
  onRefresh,
}: {
  bars: KLineData[];
  quote: LatestQuote | undefined;
  fund: FundFlowHistoryRow | undefined;
  technical: StoredTechnicalSignalSnapshot | undefined;
  isKlineLoading: boolean;
  isKlineError: boolean;
  onQuick: () => void;
  onRefresh: () => void;
}) {
  const change = quote?.changePct == null ? null : Number(quote.changePct);
  const activeSignals = (technical?.signals ?? [])
    .filter((signal) => signal.status === "triggered" || signal.status === "low-confidence")
    .slice(0, 3);
  const sparkline = compactSparkline(bars);

  return (
    <section
      className="grid gap-5 border-y border-app-line bg-app-surface/35 px-4 py-4 md:grid-cols-[190px_minmax(0,1fr)_auto] md:items-center"
      aria-label="行情底稿"
    >
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 text-[11px] text-app-muted">
          <strong className="font-medium text-app-ink">行情底稿</strong>
          <span className="font-mono">日 K · {quote?.ts.slice(5, 10) ?? "待读取"}</span>
        </div>
        {sparkline ? (
          <svg
            viewBox="0 0 168 54"
            className="mt-2 h-14 w-full text-chart-up"
            role="img"
            aria-label="最近行情走势"
          >
            <path d={sparkline} fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ) : (
          <div className="mt-2 grid h-14 place-items-center border border-dashed border-app-line bg-app-panel text-[11px] text-app-muted">
            {isKlineLoading ? "行情加载中" : isKlineError ? "行情暂不可用" : "暂无行情"}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <strong className="block text-sm text-app-ink">
          {quote
            ? `最新 ${quote.last ?? "—"} · ${change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}`
            : "行情快照暂不可用"}
        </strong>
        <p className="mt-1 text-[11px] leading-5 text-app-muted">
          研究请求独立加载；行情、资金和页面导航保持可用，不会因研究失败被清空。
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activeSignals.length > 0 ? (
            activeSignals.map((signal) => (
              <span
                key={signal.signalId}
                className="border border-app-line bg-app-panel px-2 py-1 text-[11px] text-app-muted"
              >
                {displaySignalName(signal.signalId)}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-app-muted">
              {technical == null ? "技术摘要待读取" : "暂无触发信号"}
            </span>
          )}
          <span className="border border-app-line bg-app-panel px-2 py-1 text-[11px] text-app-muted">
            主力 {fund?.mainNetInflow == null ? "—" : formatQuoteAmount(String(fund.mainNetInflow))}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button label="展开快速看盘" variant="secondary" size="sm" onClick={onQuick} />
        <Button
          label="刷新行情"
          variant="ghost"
          size="sm"
          icon={<RefreshCw className="size-3.5" />}
          onClick={onRefresh}
        />
      </div>
    </section>
  );
}

function StockDetailPage() {
  const { symbol } = useParams({ from: "/home/market/stock/$symbol" });
  const { mode: modeParam, tf: tfParam, from, list, listTab, listPage, listQ } = Route.useSearch();
  const mode: StockWorkspaceMode = modeParam ?? "quick";
  const tf = tfParam ?? "1d";
  const returnSearch = toStockReturnSearch({ listTab, listPage, listQ });
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const klineBarsRef = useRef<KLineData[]>([]);
  const displayedIndexRef = useRef<number | null>(null);
  const [chartContainerReady, setChartContainerReady] = useState(false);
  const setChartContainer = useCallback((node: HTMLDivElement | null) => {
    chartRef.current = node;
    setChartContainerReady(Boolean(node));
  }, []);

  // 选股入口专属：切换标的 / 周期只在页面内部进行，不改变 URL、不触发路由跳转，
  // 整个浏览过程停留在同一「页面」上；其余来源的详情页行为保持不变。
  const isScreenViewer = from === "screens";
  const [screenSymbol, setScreenSymbol] = useState(symbol);
  const [screenTf, setScreenTf] = useState<KlineTf>(tf);
  const [klineStatus, setKlineStatus] = useState<KlineLoadStatus>("loading");
  const [displayedKline, setDisplayedKline] = useState<LatestKlineSummary | null>(null);
  const [klineLatestBar, setKlineLatestBar] = useState<KLineData | null>(null);
  // 从选股列表重新进入（URL 参数变化）时同步内部状态；内部切换不改 URL，故不会误触发
  useEffect(() => {
    if (!isScreenViewer) return;
    setScreenSymbol(symbol);
    setScreenTf(tf);
  }, [isScreenViewer, symbol, tf]);

  // 实际展示的标的 / 周期：选股入口读内部状态，其余场景继续跟随 URL 参数
  const currentSymbol = isScreenViewer ? screenSymbol : symbol;
  const currentTf = isScreenViewer ? screenTf : tf;
  const quotes = useLatestQuotes([currentSymbol], true, true);
  const fundFlow = useFundFlowHistory(currentSymbol, 5);
  const technical = useTechnicalSignalSnapshot("stock", currentSymbol);
  const quote = quotes.data?.[0];
  const latestFund = fundFlow.data?.at(-1);
  const quoteChange = quote?.changePct == null ? null : Number(quote.changePct);
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === currentTf)?.label ?? "日";
  const researchKline = useQuery({
    ...klineBarsQueryOptions(currentSymbol, currentTf),
    enabled: shouldLoadStockResearch(mode),
  });
  const forecastQuery = useStockForecastQuery(currentSymbol);
  const fiveDayForecast = forecastQuery.data?.forecasts.find(
    (forecast) => forecast.horizon === "5D",
  );
  const forecastOverlay = useMemo(
    () =>
      klineLatestBar && fiveDayForecast
        ? buildStockForecastOverlay({
            current: klineLatestBar.close,
            p10: fiveDayForecast.p10,
            p50: fiveDayForecast.p50,
            p90: fiveDayForecast.p90,
            startTimestamp: klineLatestBar.timestamp,
            sessions: 5,
          })
        : null,
    [fiveDayForecast, klineLatestBar],
  );

  // 图表标题展示的名称：优先中文名，未收录时回退为代码（klinecharts 缺失键会原样回显 "{name}"）
  const { data: instrumentName } = useQuery(instrumentNameQueryOptions(currentSymbol));
  const displayName = instrumentName ?? currentSymbol;

  // 图表当前已应用的 symbol/tf/名称：图表只初始化一次，后续变化走增量更新
  const targetRef = useRef<{ symbol: string; tf: KlineTf; name: string }>({
    symbol: currentSymbol,
    tf: currentTf,
    name: displayName,
  });
  const latestTargetRef = useRef({ symbol: currentSymbol, tf: currentTf, name: displayName });
  latestTargetRef.current = { symbol: currentSymbol, tf: currentTf, name: displayName };

  // 左右切换的列表 = 选股页带入的选股结果列表（仅来自选股页时生效）
  const symbols = useMemo(() => {
    if (from !== "screens" || !list) return [];
    return list
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [from, list]);

  const index = symbols.indexOf(currentSymbol);
  const prevSymbol = index > 0 ? symbols[index - 1] : null;
  const nextSymbol = index >= 0 && index < symbols.length - 1 ? symbols[index + 1] : null;
  const canSwitch = index >= 0 && symbols.length > 1;

  const goToSymbol = useCallback(
    (next: string) => {
      // 选股入口：内部切换，URL 与浏览器历史保持不动，「返回」仍回到选股页
      if (isScreenViewer) {
        setScreenSymbol(next);
        return;
      }
      // 其余来源：replace 改写 URL，避免在历史里堆积中间标的
      navigate({
        to: "/home/market/stock/$symbol",
        params: { symbol: next },
        search: { tf, from, list, listTab, listPage, listQ },
        replace: true,
      });
    },
    [isScreenViewer, navigate, tf, from, list, listPage, listQ, listTab],
  );

  const goToMode = useCallback(
    (nextMode: StockWorkspaceMode) => {
      if (nextMode === mode) return;
      navigate({
        to: "/home/market/stock/$symbol",
        params: { symbol: currentSymbol },
        search: stockWorkspaceSearch({
          mode: nextMode,
          tf: currentTf,
          from,
          list,
          listTab,
          listPage,
          listQ,
        }),
        resetScroll: false,
      });
    },
    [currentSymbol, currentTf, from, list, listPage, listQ, listTab, mode, navigate],
  );

  // 初始化图表：仅挂载时执行一次。数据加载器与指标都只建一次，
  // symbol/tf 变化不再销毁重建图表（原先每次切换都 dispose + init + 全量重取）
  useEffect(() => {
    if (!chartContainerReady || !chartRef.current) return;

    const colors = readQuoteCanvasColors();
    const chartStyles = quoteCanvasChartStyles(colors);
    const chart = init(chartRef.current, {
      styles: {
        ...chartStyles,
        candle: {
          ...chartStyles.candle,
          type: "candle_solid",
        },
      },
      locale: "zh-CN",
    });

    if (!chart) return;
    chartInstanceRef.current = chart;
    chart.setStyles(chartStyles);

    chart.setDataLoader({
      getBars: async ({ type, symbol: s, period, callback }) => {
        // 一次性拉全量历史，不做前/后翻页
        if (type !== "init") {
          callback([], { forward: false, backward: false });
          return;
        }
        const requestTf = tfForPeriod(period);
        let bars: KLineData[] | null = null;
        let error: unknown = null;
        setKlineStatus("loading");
        try {
          bars = await queryClient.fetchQuery(klineBarsQueryOptions(s.ticker, requestTf));
        } catch (caught) {
          error = caught;
          bars = [];
        }
        // 图表已卸载/重建时丢弃过期结果
        if (chartInstanceRef.current !== chart) return;
        if (
          latestTargetRef.current.symbol !== s.ticker ||
          latestTargetRef.current.tf !== requestTf
        ) {
          return;
        }
        const loadedBars = bars ?? [];
        klineBarsRef.current = loadedBars;
        setKlineLatestBar(loadedBars.at(-1) ?? null);
        setKlineStatus(resolveKlineStatus({ bars: loadedBars, error }));
        displayedIndexRef.current = loadedBars.length > 0 ? loadedBars.length - 1 : null;
        setDisplayedKline(summarizeLatestKline(loadedBars));
        callback(loadedBars, { forward: false, backward: false });
      },
    });

    const handleCrosshairChange = (data?: unknown) => {
      const bars = klineBarsRef.current;
      if (bars.length === 0) return;
      const crosshair = data as Crosshair | null | undefined;
      const converted =
        crosshair?.x == null || crosshair.y == null
          ? null
          : chart.convertFromPixel([{ x: crosshair.x, y: crosshair.y }]);
      const point = Array.isArray(converted) ? converted[0] : converted;
      const requestedIndex = point?.dataIndex;
      const index =
        requestedIndex != null &&
        Number.isInteger(requestedIndex) &&
        requestedIndex >= 0 &&
        requestedIndex < bars.length
          ? requestedIndex
          : bars.length - 1;
      if (displayedIndexRef.current === index) return;
      const summary = summarizeKlineAt(bars, index);
      if (!summary) return;
      displayedIndexRef.current = index;
      setDisplayedKline(summary);
    };
    chart.subscribeAction("onCrosshairChange", handleCrosshairChange);

    // 指标只创建一次；数据重载会自动触发指标重算，无需在 getBars 里重复创建
    chart.createIndicator(
      {
        name: "MA",
        calcParams: [5, 10, 20, 30, 60, 120, 250],
        paneId: "candle_pane",
        styles: {
          lines: [
            colors.ma5,
            colors.ma10,
            colors.ma20,
            colors.ma30,
            colors.ma60,
            colors.ma120,
            colors.ma250,
          ].map((color) => ({ color })),
        },
      },
      true,
    );
    chart.setOffsetRightDistance(132);
    chart.createIndicator(
      {
        name: "MACD",
        styles: {
          // 通达信标准：DIF 白、DEA 黄；柱红涨绿跌
          lines: [{ color: colors.ma5 }, { color: colors.ma10 }],
          bars: [{ upColor: colors.up, downColor: colors.down, noChangeColor: colors.flat }],
        },
        figures: macdFigures(colors),
      },
      true,
    );
    chart.createIndicator(
      {
        name: "VOL",
        styles: {
          // 量均线沿用均线标准色（MA5 白 / MA10 黄 / MA20 紫）；柱红涨绿跌
          lines: [{ color: colors.ma5 }, { color: colors.ma10 }, { color: colors.ma20 }],
          bars: [{ upColor: colors.up, downColor: colors.down, noChangeColor: colors.flat }],
        },
      },
      true,
    );

    const initialTarget = latestTargetRef.current;
    targetRef.current = initialTarget;
    chart.setSymbol({ ticker: initialTarget.symbol, name: initialTarget.name });
    chart.setPeriod(periodForTf(initialTarget.tf));
    const chartRoot = chartRef.current.firstElementChild;
    if (chartRoot instanceof HTMLElement) {
      chartRoot.style.height = `${chartRef.current.clientHeight}px`;
    }
    // 行情中心外壳在特性开关加载后才挂载图表容器；klinecharts 首次测量可能仍是 0 高，
    // 下一帧容器完成布局后再 resize，保留后续 setSymbol/setPeriod 的增量更新路径。
    chart.resize();
    const resizeFrame = requestAnimationFrame(() => {
      if (chartInstanceRef.current === chart) chart.resize();
    });

    return () => {
      cancelAnimationFrame(resizeFrame);
      chart.unsubscribeAction("onCrosshairChange", handleCrosshairChange);
      if (chartInstanceRef.current === chart) chartInstanceRef.current = null;
      dispose(chart);
    };
  }, [chartContainerReady, queryClient]);

  // 展示的标的 / 周期 / 名称变化：只做增量更新，避免整图重建与多余的一次数据加载。
  // setSymbol 为浅合并，名称必须每次一并传入，否则切换标的时会残留上一个标的的名称
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    const prev = targetRef.current;
    if (prev.symbol === currentSymbol && prev.tf === currentTf && prev.name === displayName) return;

    setKlineStatus("loading");
    klineBarsRef.current = [];
    setKlineLatestBar(null);
    displayedIndexRef.current = null;
    setDisplayedKline(null);
    if (prev.symbol !== currentSymbol || prev.name !== displayName) {
      chart.setSymbol({ ticker: currentSymbol, name: displayName });
    }
    if (prev.tf !== currentTf) chart.setPeriod(periodForTf(currentTf));
    targetRef.current = { symbol: currentSymbol, tf: currentTf, name: displayName };
  }, [currentSymbol, currentTf, displayName]);

  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    chart.removeOverlay({ name: "stock-forecast-projection" });
    if (mode !== "quick" || !forecastOverlay) return;

    const colors = readQuoteCanvasColors();
    const points = [
      ...forecastOverlay.points.map((point) => ({
        timestamp: point.timestamp,
        value: point.p90,
      })),
      ...forecastOverlay.points.map((point) => ({
        timestamp: point.timestamp,
        value: point.p10,
      })),
      ...forecastOverlay.points.map((point) => ({
        timestamp: point.timestamp,
        value: point.p50,
      })),
    ];
    const size = forecastOverlay.points.length;
    chart.createOverlay({
      name: "stock-forecast-projection",
      paneId: "candle_pane",
      lock: true,
      visible: true,
      zLevel: 20,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      points,
      extendData: {
        size,
        color: colors.forecast,
        bandColor: colors.forecastBand,
      },
    });
    return () => {
      chart.removeOverlay({ name: "stock-forecast-projection" });
    };
  }, [chartContainerReady, forecastOverlay, mode]);

  // 键盘左右方向键切换相邻标的（焦点位于输入类元素内时忽略）
  useEffect(() => {
    if (!canSwitch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prevSymbol) {
        e.preventDefault();
        goToSymbol(prevSymbol);
      } else if (e.key === "ArrowRight" && nextSymbol) {
        e.preventDefault();
        goToSymbol(nextSymbol);
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [canSwitch, prevSymbol, nextSymbol, goToSymbol]);

  const retryKline = useCallback(async () => {
    setKlineStatus("loading");
    klineBarsRef.current = [];
    setKlineLatestBar(null);
    displayedIndexRef.current = null;
    setDisplayedKline(null);
    await queryClient.invalidateQueries({
      queryKey: ["kline", currentSymbol, currentTf],
    });
    chartInstanceRef.current?.resetData();
  }, [currentSymbol, currentTf, queryClient]);

  const workspaceStatusItems: StockWorkspaceStatusItem[] = [
    {
      label: "实时行情",
      value: quote
        ? `${quote.ts.slice(0, 16).replace("T", " ")} · ${quote.quality === "available" ? "可用" : "低置信"}`
        : quotes.isLoading
          ? "读取中"
          : "暂不可用",
      tone: quote ? "success" : quotes.isError ? "error" : "neutral",
    },
    {
      label: `${periodLabel} K 线`,
      value:
        mode === "research"
          ? researchKline.isLoading
            ? "读取中"
            : researchKline.data?.length
              ? `${researchKline.data.length} 根 · 可用`
              : "暂不可用"
          : klineStatus === "ready"
            ? `${klineBarsRef.current.length} 根 · 可用`
            : klineStatus === "loading"
              ? "读取中"
              : "暂不可用",
      tone:
        mode === "research"
          ? researchKline.data?.length
            ? "success"
            : researchKline.isError
              ? "error"
              : "neutral"
          : klineStatus === "ready"
            ? "success"
            : klineStatus === "error"
              ? "error"
              : "neutral",
    },
    {
      label: "资金结构",
      value: latestFund?.date
        ? `${latestFund.date.slice(5)} · 可用`
        : fundFlow.isLoading
          ? "读取中"
          : "暂不可用",
      tone: latestFund ? "success" : fundFlow.isError ? "error" : "neutral",
    },
    {
      label: "技术摘要",
      value: technical.data
        ? `${technical.data.signals.length} 项 · ${
            technical.data.quality === "available" ? "可用" : "部分"
          }`
        : technical.isLoading
          ? "读取中"
          : "暂不可用",
      tone: technical.data ? "success" : technical.isError ? "warning" : "neutral",
    },
  ];

  return (
    <MarketCenterShell variant="stock">
      <VStack gap={3} style={{ height: "100%" }}>
        <div className="flex flex-wrap items-center gap-2">
          {from === "screens" ? (
            <Button
              label="← 返回"
              variant="ghost"
              size="sm"
              onClick={() => router.history.back()}
            />
          ) : (
            <Link to="/home/market/stock" search={returnSearch} style={{ textDecoration: "none" }}>
              <Button label="← 返回" variant="ghost" size="sm" />
            </Link>
          )}
          {canSwitch ? (
            <HStack gap={1} align="center">
              <Button
                label="上一只"
                variant="secondary"
                size="sm"
                isDisabled={!prevSymbol}
                onClick={() => {
                  if (prevSymbol) goToSymbol(prevSymbol);
                }}
              />
              <Text size="sm" type="supporting" hasTabularNumbers>
                {index + 1} / {symbols.length}
              </Text>
              <Button
                label="下一只"
                variant="secondary"
                size="sm"
                isDisabled={!nextSymbol}
                onClick={() => {
                  if (nextSymbol) goToSymbol(nextSymbol);
                }}
              />
            </HStack>
          ) : null}
          <div className="ml-auto">
            <TabList
              value={currentTf}
              onChange={(v) => {
                if (isScreenViewer) {
                  setScreenTf(v as KlineTf);
                  return;
                }
                navigate({
                  to: "/home/market/stock/$symbol",
                  params: { symbol: currentSymbol },
                  search: stockWorkspaceSearch({
                    mode,
                    tf: v as KlineTf,
                    from,
                    list,
                    listTab,
                    listPage,
                    listQ,
                  }),
                  replace: true,
                  resetScroll: false,
                });
              }}
            >
              {PERIOD_OPTIONS.map((periodOption) => (
                <Tab
                  key={periodOption.value}
                  value={periodOption.value}
                  label={periodOption.label}
                />
              ))}
            </TabList>
          </div>
        </div>

        <StockWorkspaceHeader
          symbol={currentSymbol}
          displayName={displayName}
          quote={quote}
          quoteChange={quoteChange}
          mode={mode}
          statusItems={workspaceStatusItems}
          signalCount={technical.data?.signals.length ?? 0}
          isRefreshingQuotes={quotes.isFetching}
          onRefreshQuotes={() => void quotes.refetch()}
          onModeChange={goToMode}
        />

        {mode === "quick" ? (
          <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]" aria-label="快速看盘">
            <div className="overflow-hidden rounded-2xl border border-app-line bg-app-panel">
              <section
                className="border-quote-line bg-quote-canvas text-quote-ink"
                aria-label={`${periodLabel} K 线与资金结构`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-3.5">
                  <div>
                    <strong className="text-xs">{periodLabel} K 线与未来一周</strong>
                    <p className="mt-0.5 text-[11px] text-quote-axis">
                      历史行情来自当前 K 线接口；未来一周只绘制一条 P50 终点插值路径
                    </p>
                  </div>
                  <span className="border border-primary bg-primary px-2.5 py-1 font-mono text-[11px] text-white">
                    {forecastQuery.isLoading
                      ? "未来 5D · 预测读取中"
                      : fiveDayForecast?.p50 != null
                        ? "未来 5D · 1 条 P50"
                        : "未来 5D · 预测待接入"}
                  </span>
                </div>
                {displayedKline ? (
                  <div className="space-y-1 px-4 pb-2 font-mono text-[11px] text-quote-axis">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>时间: {formatKlineDate(displayedKline.bar.timestamp)}</span>
                      <span>开: {displayedKline.bar.open.toFixed(2)}</span>
                      <span>高: {displayedKline.bar.high.toFixed(2)}</span>
                      <span>低: {displayedKline.bar.low.toFixed(2)}</span>
                      <span>收: {displayedKline.bar.close.toFixed(2)}</span>
                      <span>成交量: {formatKlineVolume(displayedKline.bar.volume)}</span>
                      <span>成交额: {formatKlineAmount(displayedKline.bar.turnover)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <span>MA(5,10,20,30,60,120,250)</span>
                      {KLINE_MA_PERIODS.map((maPeriod) => (
                        <span
                          key={maPeriod}
                          style={{
                            color: `color-mix(in srgb, var(--quote-canvas-ma-${maPeriod}) 50%, var(--quote-canvas-ink))`,
                          }}
                        >
                          MA{maPeriod}: {displayedKline.ma[maPeriod]?.toFixed(2) ?? "—"}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="relative">
                  <div ref={setChartContainer} className="min-h-[480px] w-full bg-quote-canvas" />
                  <KlineStatusOverlay status={klineStatus} onRetry={retryKline} />
                </div>
                <div
                  className="grid gap-2 border-t border-quote-line px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  aria-label="未来一周预测摘要"
                >
                  <div>
                    <strong className="text-[11px] text-quote-ink">
                      {fiveDayForecast?.p50 != null
                        ? `今收 ${klineLatestBar?.close.toFixed(2) ?? "—"} → 五个交易日 P50 ${fiveDayForecast.p50.toFixed(2)}`
                        : forecastQuery.isError
                          ? "未来一周预测暂不可用"
                          : fiveDayForecast?.quality === "missing"
                            ? "历史样本不足，暂不生成预测路径"
                            : "正在读取未来一周预测"}
                    </strong>
                    <p className="mt-1 text-[11px] leading-5 text-quote-axis">
                      阴影为 P10–P90 概率区间，日节点由今收向 5D
                      中位终点几何插值；预测不是目标价，也不是买卖建议。
                    </p>
                  </div>
                  {fiveDayForecast?.p10 != null &&
                  fiveDayForecast.p90 != null &&
                  fiveDayForecast.upProbability != null ? (
                    <div className="grid grid-cols-2 gap-px bg-quote-line font-mono text-[11px]">
                      <span className="bg-quote-surface px-3 py-2 text-quote-axis">
                        P10–P90
                        <strong className="mt-1 block text-quote-ink">
                          {fiveDayForecast.p10.toFixed(2)}–{fiveDayForecast.p90.toFixed(2)}
                        </strong>
                      </span>
                      <span className="bg-quote-surface px-3 py-2 text-quote-axis">
                        上涨概率
                        <strong className="mt-1 block text-quote-ink">
                          {(fiveDayForecast.upProbability * 100).toFixed(1)}%
                        </strong>
                      </span>
                    </div>
                  ) : null}
                </div>
                <section
                  className="border-t border-quote-line px-4 py-3.5"
                  aria-label="个股资金结构"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <strong className="text-xs">资金结构</strong>
                      <Text as="p" className="mt-1 text-[11px] text-quote-axis">
                        {latestFund?.date ?? "暂无资金快照"} · 主力净流入不等同于全部资金
                      </Text>
                    </div>
                    <span className="font-mono text-[11px] text-quote-axis">
                      {quote?.ts.slice(0, 10) ?? "待读取"} · {quote?.source ?? "腾讯"}
                    </span>
                  </div>
                  <FundStructure
                    row={latestFund}
                    isLoading={fundFlow.isLoading}
                    isError={fundFlow.isError}
                    tone="quoteCanvas"
                  />
                </section>
              </section>
            </div>

            <aside className="space-y-3" aria-label="快速研判">
              <section className="rounded-2xl border border-app-line bg-app-panel p-4">
                <p className="font-mono text-[11px] font-semibold tracking-[0.11em] text-primary">
                  QUICK READ · CURRENT EVIDENCE
                </p>
                <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-app-ink">
                  {technical.data?.summary?.overall.headline ?? "等待技术摘要形成结论"}
                </h2>
                <p className="mt-2 text-[11px] leading-6 text-app-muted">
                  {technical.data?.summary?.overall.rationale ??
                    "当前只展示可追溯的行情、资金和技术证据，不用缺失数据补成中性结论。"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(technical.data?.signals ?? [])
                    .filter((signal) => signal.status === "triggered")
                    .slice(0, 4)
                    .map((signal) => (
                      <span
                        key={signal.signalId}
                        className="rounded-full bg-app-surface px-2 py-1 text-[11px] text-app-muted"
                      >
                        {displaySignalName(signal.signalId)}
                      </span>
                    ))}
                </div>
                <button
                  type="button"
                  className="focus-ring mt-3 w-full bg-app-surface px-3 py-2 text-left text-[11px] font-semibold text-primary"
                  onClick={() => goToMode("research")}
                >
                  进入深度研究 · {technical.data?.signals.length ?? 44} 项信号与风险 →
                </button>
              </section>

              <section className="rounded-2xl border border-app-line bg-app-panel p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-app-ink">盘面速览</h2>
                  <span className="font-mono text-[11px] text-app-muted">
                    {quote?.ts.slice(0, 10) ?? "待读取"}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[11px]">
                  <div>
                    <dt className="text-app-muted">最新 / 涨跌</dt>
                    <dd className="mt-1 text-app-ink">
                      {quote?.last ?? "—"} /{" "}
                      {quoteChange == null ? "—" : `${quoteChange.toFixed(2)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-app-muted">成交额</dt>
                    <dd className="mt-1 text-app-ink">
                      {formatQuoteAmount(quote?.amount ?? null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-app-muted">PE / PE-TTM</dt>
                    <dd className="mt-1 text-app-ink">
                      {quote?.pe ?? "—"} / {quote?.peTtm ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-app-muted">PB</dt>
                    <dd className="mt-1 text-app-ink">{quote?.pb ?? "—"}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </section>
        ) : (
          <section className="space-y-4" aria-label="深度研究工作区">
            <ResearchMarketContext
              bars={researchKline.data ?? []}
              quote={quote}
              fund={latestFund}
              technical={technical.data}
              isKlineLoading={researchKline.isLoading}
              isKlineError={researchKline.isError}
              onQuick={() => goToMode("quick")}
              onRefresh={() => {
                void quotes.refetch();
                void fundFlow.refetch();
                void researchKline.refetch();
              }}
            />
            <StockResearchPanel symbol={currentSymbol} onQuick={() => goToMode("quick")} />
          </section>
        )}
      </VStack>
    </MarketCenterShell>
  );
}
