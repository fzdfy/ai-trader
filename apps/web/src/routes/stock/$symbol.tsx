import { useEffect, useRef, useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Button } from "@astryxdesign/core/Button";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { init, dispose, type Chart } from "klinecharts";
import type { KlineTf } from "../../hooks/useInstruments";
import { chartDown, chartFlat, chartUp } from "../../lib/theme";

export const Route = createFileRoute("/stock/$symbol")({
  component: StockDetailPage,
});

const INDICATORS = ["MA", "MACD", "KDJ", "RSI"] as const;

/** 周期选项：tf → klinecharts period 映射 */
const PERIOD_OPTIONS: { value: KlineTf; label: string }[] = [
  { value: "1m", label: "分时" },
  { value: "1d", label: "日" },
  { value: "5d", label: "5日" },
  { value: "1w", label: "周" },
  { value: "1mo", label: "月" },
];

function periodForTf(tf: KlineTf): { span: number; type: "minute" | "day" | "week" | "month" } {
  switch (tf) {
    case "1m":
      return { span: 1, type: "minute" };
    case "5d":
      return { span: 5, type: "day" };
    case "1w":
      return { span: 1, type: "week" };
    case "1mo":
      return { span: 1, type: "month" };
    default:
      return { span: 1, type: "day" };
  }
}

function StockDetailPage() {
  const { symbol } = useParams({ from: "/stock/$symbol" });
  const [tf, setTf] = useState<KlineTf>("1d");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = init(chartRef.current, {
      styles: {
        grid: { horizontal: { color: "var(--color-border, #eee)" } },
        candle: {
          bar: {
            upColor: chartUp(),
            downColor: chartDown(),
            noChangeColor: chartFlat(),
          },
        },
      },
      locale: "zh-CN",
    });

    if (!chart) return;

    chart.setSymbol({ ticker: symbol });
    chart.setPeriod(periodForTf(tf));

    chart.setDataLoader({
      getBars: async ({ callback }) => {
        const params = new URLSearchParams({ symbol, tf });
        const res = await fetch(`/api/v1/kline?${params}`);
        const json = await res.json();
        const rows = (json.success ? json.data : []) as Array<Record<string, unknown>>;

        const data = rows
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

        callback(data, { forward: false, backward: false });

        // 数据加载完成后创建指标
        chart.createIndicator({ name: "MA", paneId: "candle_pane" }, true);
        chart.createIndicator({ name: "MACD" }, true);
        chart.createIndicator({ name: "VOL" }, true);
        // for (const name of INDICATORS.slice(1)) {
        //   chart.createIndicator({ name });
        // }
      },
    });

    chartInstanceRef.current = chart;

    return () => {
      dispose(chartRef.current!);
    };
  }, [symbol, tf]);

  return (
    <VStack gap={4} style={{ height: "100%" }}>
      <HStack gap={2} align="center">
        <Link to="/home/market/stocks" search={{ tab: "search" }} style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
        <TabList value={tf} onChange={(v) => setTf(v as KlineTf)}>
          {PERIOD_OPTIONS.map((p) => (
            <Tab key={p.value} value={p.value} label={p.label} />
          ))}
        </TabList>
      </HStack>
      <div ref={chartRef} style={{ flex: 1, minHeight: 0 }} />
    </VStack>
  );
}
