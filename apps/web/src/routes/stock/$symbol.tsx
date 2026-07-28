import { useEffect, useRef } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Button } from "@astryxdesign/core/Button";
import { init, dispose, type Chart } from "klinecharts";

export const Route = createFileRoute("/stock/$symbol")({
  component: StockDetailPage,
});

const INDICATORS = ["MA", "MACD", "KDJ", "RSI"] as const;

function StockDetailPage() {
  const { symbol } = useParams({ from: "/stock/$symbol" });
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = init(chartRef.current, {
      styles: {
        grid: { horizontal: { color: "var(--color-border, #eee)" } },
        candle: {
          bar: {
            upColor: "#ef4444",
            downColor: "#22c55e",
            noChangeColor: "#888",
          },
        },
      },
      locale: "zh-CN",
    });

    if (!chart) return;

    chart.setSymbol({ ticker: symbol });
    chart.setPeriod({ span: 1, type: "day" });

    chart.setDataLoader({
      getBars: async ({ callback }) => {
        const params = new URLSearchParams({ symbol, tf: "1d" });
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
  }, [symbol]);

  return (
    <VStack gap={4} style={{ height: "100%" }}>
      <HStack gap={2} align="center">
        <Link to="/watchlist" style={{ textDecoration: "none" }}>
          <Button label="← 返回" variant="ghost" size="sm" />
        </Link>
      </HStack>
      <div ref={chartRef} style={{ flex: 1, minHeight: 0 }} />
    </VStack>
  );
}
