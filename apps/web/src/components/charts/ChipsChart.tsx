import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export interface ChipPoint {
  price: number;
  percent: number;
  cumPercent: number;
}

interface ChipsChartProps {
  /** 价格分布数组（升序） */
  distribution: ChipPoint[];
  /** 当前价，用于画穿透线 */
  currentPrice: number;
}

/**
 * 筹码分布图 — 水平条形图。
 * - Y 轴：价格档位（升序，低在底部）
 * - X 轴：筹码占比(%)
 * - 红色横线：当前价（获利盘分界线）
 */
export function ChipsChart({ distribution, currentPrice }: ChipsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: "svg" });

    const handleResize = () => chartRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || distribution.length === 0) return;

    const prices = distribution.map((d) => d.price);
    const percents = distribution.map((d) => d.percent);

    // 当前价附近的索引（用于标线位置）
    let priceIdx = 0;
    for (let i = 0; i < prices.length; i++) {
      if (prices[i]! <= currentPrice) priceIdx = i;
    }

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line" },
          formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => {
            if (!Array.isArray(params) || !params[0]) return "";
            const idx = params[0].dataIndex;
            const d = distribution[idx];
            if (!d) return "";
            const profit = d.price <= currentPrice ? "获利盘" : "套牢盘";
            return [
              `<strong>价格 ${d.price.toFixed(2)}</strong>`,
              `筹码占比：${d.percent.toFixed(2)}%`,
              `累计占比：${d.cumPercent.toFixed(2)}%`,
              profit,
            ].join("<br/>");
          },
        },
        grid: { left: 70, right: 30, top: 20, bottom: 30 },
        xAxis: {
          type: "value",
          name: "筹码占比(%)",
          nameTextStyle: { color: "var(--color-text-secondary, #888)", fontSize: 11 },
          axisLabel: {
            color: "var(--color-text-secondary, #888)",
            formatter: "{value}%",
          },
          splitLine: { lineStyle: { color: "var(--color-border, #e0e0e0)", type: "dashed" } },
        },
        yAxis: {
          type: "category",
          data: prices.map((p) => p.toFixed(2)),
          axisLabel: { color: "var(--color-text-secondary, #888)", fontSize: 10 },
          axisTick: { show: false },
          splitLine: { show: false },
        },
        series: [
          {
            type: "bar",
            data: percents.map((v, i) => ({
              value: v,
              itemStyle: {
                color: distribution[i]!.price <= currentPrice ? "#22c55e" : "#ef4444",
              },
            })),
            barWidth: "70%",
            markLine: {
              silent: true,
              symbol: "none",
              lineStyle: { color: "#f59e0b", width: 2 },
              label: {
                formatter: `当前价 ${currentPrice.toFixed(2)}`,
                color: "#f59e0b",
                fontSize: 11,
                position: "insideEndTop",
              },
              data: [{ yAxis: priceIdx }],
            },
          },
        ],
      },
      { notMerge: true },
    );
  }, [distribution, currentPrice]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 420,
        minHeight: 0,
        background: "var(--color-surface, #fff)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
