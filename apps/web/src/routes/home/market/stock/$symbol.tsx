import { useCallback, useEffect, useMemo, useRef } from "react";
import { createFileRoute, useNavigate, useParams, Link, useRouter } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  init,
  dispose,
  type Chart,
  type IndicatorFigure,
  type IndicatorFigureStyle,
  type KLineData,
  type Period,
} from "klinecharts";
import type { KlineTf } from "../../../../hooks/useInstruments";
import { chartDown, chartFlat, chartUp, chartMa, chartGrid } from "../../../../lib/theme";

export const Route = createFileRoute("/home/market/stock/$symbol")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tf?: KlineTf; from?: string; list?: string } => ({
    tf: (search.tf as KlineTf) ?? "1d",
    from: search.from as string | undefined,
    // 来源页（选股页）传入的股票列表，用于左右切换相邻标的
    list: search.list as string | undefined,
  }),
  component: StockDetailPage,
});

/** MACD 指标单根计算结果 */
type MacdResult = { macd?: number };

/**
 * MACD 指标 figures 覆盖：内置柱体在 MACD 放大时绘制为空心(stroke)、
 * 缩小时实心(fill)，这里统一强制为红涨绿跌实心。
 */
const MACD_FIGURES: IndicatorFigure[] = [
  { key: "dif", title: "DIF: ", type: "line" },
  { key: "dea", title: "DEA: ", type: "line" },
  {
    key: "macd",
    title: "MACD: ",
    type: "bar",
    baseValue: 0,
    styles: ({ data }) => {
      const currentMacd = (data.current as MacdResult | null | undefined)?.macd ?? Number.MIN_SAFE_INTEGER;
      const color = currentMacd > 0 ? chartUp() : (currentMacd < 0 ? chartDown() : chartFlat());
      return { style: "fill", color, borderColor: color } as unknown as IndicatorFigureStyle;
    },
  },
];

/** 周期选项：一份表同时用于 tf → period 正查与 period → tf 反查 */
const PERIOD_OPTIONS: { value: KlineTf; label: string; period: Period }[] = [
  { value: "1m", label: "分时", period: { span: 1, type: "minute" } },
  { value: "1d", label: "日", period: { span: 1, type: "day" } },
  { value: "5d", label: "5日", period: { span: 5, type: "day" } },
  { value: "1w", label: "周", period: { span: 1, type: "week" } },
  { value: "1mo", label: "月", period: { span: 1, type: "month" } },
];

const DEFAULT_PERIOD: Period = { span: 1, type: "day" };

function periodForTf(tf: KlineTf): Period {
  return PERIOD_OPTIONS.find((p) => p.value === tf)?.period ?? DEFAULT_PERIOD;
}

/** klinecharts period → tf 反查：数据加载回调里据此决定请求哪个周期 */
function tfForPeriod(period: Period): KlineTf {
  return (
    PERIOD_OPTIONS.find(
      (p) => p.period.type === period.type && p.period.span === period.span,
    )?.value ?? "1d"
  );
}

/**
 * K 线数据缓存，key = `${symbol}|${tf}`。
 * 左右切换标的 / 切换周期时直接复用已解析的数据，避免重复请求与重复解析；
 * 同时用 in-flight 表合并并发请求（setSymbol、setPeriod 各自可能触发一次加载）。
 */
const BARS_CACHE_LIMIT = 24;
const barsCache = new Map<string, KLineData[]>();
const barsInflight = new Map<string, Promise<KLineData[]>>();

function readCachedBars(key: string): KLineData[] | undefined {
  const hit = barsCache.get(key);
  if (hit) {
    // 命中后移到队尾（Map 保持插入序），实现最简单的 LRU 淘汰
    barsCache.delete(key);
    barsCache.set(key, hit);
  }
  return hit;
}

function writeCachedBars(key: string, bars: KLineData[]): void {
  barsCache.set(key, bars);
  while (barsCache.size > BARS_CACHE_LIMIT) {
    const oldest = barsCache.keys().next().value;
    if (oldest === undefined) break;
    barsCache.delete(oldest);
  }
}

async function fetchBars(symbol: string, tf: KlineTf): Promise<KLineData[]> {
  const key = `${symbol}|${tf}`;
  const cached = readCachedBars(key);
  if (cached) return cached;

  const pending = barsInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams({ symbol, tf });
    const res = await fetch(`/api/v1/kline?${params}`);
    const json = (await res.json()) as {
      success?: boolean;
      data?: Array<Record<string, unknown>>;
    };
    const rows = json.success ? (json.data ?? []) : [];
    const bars: KLineData[] = rows
      .filter((k) => k.time)
      .map((k) => ({
        timestamp: new Date(k.time as string).getTime(),
        open: Number.parseFloat(k.open as string),
        high: Number.parseFloat(k.high as string),
        low: Number.parseFloat(k.low as string),
        close: Number.parseFloat(k.close as string),
        volume: Number.parseFloat(k.volume as string),
      }))
      .toSorted((a, b) => a.timestamp - b.timestamp);
    writeCachedBars(key, bars);
    return bars;
  })();

  barsInflight.set(key, request);
  try {
    return await request;
  } finally {
    barsInflight.delete(key);
  }
}

function StockDetailPage() {
  const { symbol } = useParams({ from: "/home/market/stock/$symbol" });
  const { tf: tfParam, from, list } = Route.useSearch();
  const tf = tfParam ?? "1d";
  const navigate = useNavigate();
  const router = useRouter();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  // 图表当前已应用的 symbol/tf：图表只初始化一次，后续变化走增量更新
  const targetRef = useRef<{ symbol: string; tf: KlineTf }>({ symbol, tf });

  // 左右切换的列表 = 选股页带入的选股结果列表（仅来自选股页时生效）
  const symbols = useMemo(() => {
    if (from !== "screens" || !list) return [];
    return list
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [from, list]);

  const index = symbols.indexOf(symbol);
  const prevSymbol = index > 0 ? symbols[index - 1] : null;
  const nextSymbol = index >= 0 && index < symbols.length - 1 ? symbols[index + 1] : null;
  const canSwitch = index >= 0 && symbols.length > 1;

  // 切换标的：replace 保留选股页那条历史记录，使「返回」仍回到选股页
  const goToSymbol = useCallback(
    (next: string) => {
      navigate({
        to: "/home/market/stock/$symbol",
        params: { symbol: next },
        search: { tf, from, list },
        replace: true,
      });
    },
    [navigate, tf, from, list],
  );

  // 初始化图表：仅挂载时执行一次。数据加载器与指标都只建一次，
  // symbol/tf 变化不再销毁重建图表（原先每次切换都 dispose + init + 全量重取）
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = init(chartRef.current, {
      styles: {
        grid: { horizontal: { color: chartGrid() } },
        candle: {
          type: "candle_solid",
          bar: {
            upColor: chartUp(),
            downColor: chartDown(),
            noChangeColor: chartFlat(),
            upBorderColor: chartUp(),
            downBorderColor: chartDown(),
            noChangeBorderColor: chartFlat(),
            upWickColor: chartUp(),
            downWickColor: chartDown(),
            noChangeWickColor: chartFlat(),
          },
        },
      },
      locale: "zh-CN",
    });

    if (!chart) return;
    chartInstanceRef.current = chart;

    chart.setDataLoader({
      getBars: async ({ type, symbol: s, period, callback }) => {
        // 一次性拉全量历史，不做前/后翻页
        if (type !== "init") {
          callback([], { forward: false, backward: false });
          return;
        }
        let bars: KLineData[] = [];
        try {
          bars = await fetchBars(s.ticker, tfForPeriod(period));
        } catch {
          bars = [];
        }
        // 图表已卸载/重建时丢弃过期结果
        if (chartInstanceRef.current !== chart) return;
        callback(bars, { forward: false, backward: false });
      },
    });

    // 指标只创建一次；数据重载会自动触发指标重算，无需在 getBars 里重复创建
    chart.createIndicator(
      {
        name: "MA",
        calcParams: [5, 10, 20, 30, 60, 120, 250],
        paneId: "candle_pane",
        styles: {
          lines: [5, 10, 20, 30, 60, 120, 250].map((p) => ({ color: chartMa(p) })),
        },
      },
      true,
    );
    chart.createIndicator(
      {
        name: "MACD",
        styles: {
          // 通达信标准：DIF 白、DEA 黄；柱红涨绿跌
          lines: [{ color: chartMa(5) }, { color: chartMa(10) }],
          bars: [{ upColor: chartUp(), downColor: chartDown(), noChangeColor: chartFlat() }],
        },
        figures: MACD_FIGURES,
      },
      true,
    );
    chart.createIndicator(
      {
        name: "VOL",
        styles: {
          // 量均线沿用均线标准色（MA5 白 / MA10 黄 / MA20 紫）；柱红涨绿跌
          lines: [{ color: chartMa(5) }, { color: chartMa(10) }, { color: chartMa(20) }],
          bars: [{ upColor: chartUp(), downColor: chartDown(), noChangeColor: chartFlat() }],
        },
      },
      true,
    );

    chart.setSymbol({ ticker: targetRef.current.symbol });
    chart.setPeriod(periodForTf(targetRef.current.tf));

    return () => {
      if (chartInstanceRef.current === chart) chartInstanceRef.current = null;
      dispose(chart);
    };
  }, []);

  // symbol / tf 变化：只做增量更新，避免整图重建与多余的一次数据加载
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    const prev = targetRef.current;
    if (prev.symbol === symbol && prev.tf === tf) return;

    if (prev.symbol !== symbol) chart.setSymbol({ ticker: symbol });
    if (prev.tf !== tf) chart.setPeriod(periodForTf(tf));
    targetRef.current = { symbol, tf };
  }, [symbol, tf]);

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

  return (
    <VStack gap={4} style={{ height: "100%" }}>
      <HStack gap={2} align="center">
        {from === "screens" ? (
          // 回到选股页：走浏览器历史回退，保留选股页原先的 URL search（策略/范围/返回数量等），
          // 否则直接 Link 到 /home/screens 会丢失这些条件、页面回到默认状态
          <Button
            label="← 返回"
            variant="ghost"
            size="sm"
            onClick={() => router.history.back()}
          />
        ) : (
          <Link to="/home/market/stock" search={{ tab: "stock" }} style={{ textDecoration: "none" }}>
            <Button label="← 返回" variant="ghost" size="sm" />
          </Link>
        )}
        {canSwitch && (
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
        )}
        <TabList
          value={tf}
          onChange={(v) =>
            navigate({
              to: "/home/market/stock/$symbol",
              params: { symbol },
              search: { tf: v as KlineTf, from, list },
              replace: true,
            })
          }
        >
          {PERIOD_OPTIONS.map((p) => (
            <Tab key={p.value} value={p.value} label={p.label} />
          ))}
        </TabList>
      </HStack>
      <div ref={chartRef} style={{ flex: 1, minHeight: 0 }} />
    </VStack>
  );
}
