import { useEffect, useRef } from "react";
import { echarts } from "../../lib/echarts";
import type { ECharts } from "echarts";
import {
  chartAxisText,
  chartDim,
  chartEquity,
  chartUp,
  axisLabelStyle,
  axisLineStyle,
  splitLineStyle,
} from "../../lib/theme";

interface FactorLayerChartProps {
  /** 交易日（与各层 nav 等长） */
  dates: string[];
  /** 净值序列：键为 L1..LN（第 1 层因子值最低）与 longShort（多空） */
  nav: Record<string, number[]>;
}

/** 在两个 #rrggbb 之间线性插值（用于分层由冷到暖的顺序色阶） */
function mixHex(a: string, b: string, t: number): string {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a.trim());
  const pb = /^#?([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return t < 0.5 ? a : b;
  const na = Number.parseInt(pa[1]!, 16);
  const nb = Number.parseInt(pb[1]!, 16);
  const mix = (shift: number) => {
    const va = (na >> shift) & 255;
    const vb = (nb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  const r = mix(16);
  const g = mix(8);
  const bl = mix(0);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/**
 * 因子分层净值图。
 *
 * 按因子值从低到高把标的等分为 N 层，层内等权持有，逐日复利得到各层净值曲线；
 * 色阶由冷（低层，蓝）到暖（高层，红，A 股红涨语义）单调过渡，多空组合单独高亮。
 * 分层单调性越明显，说明因子区分度越强。
 */
export function FactorLayerChart({ dates, nav }: FactorLayerChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  // 初始化图表 + resize 监听（仅执行一次）
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

  // 数据更新
  useEffect(() => {
    if (!chartRef.current || dates.length === 0) return;

    const layerKeys = Object.keys(nav)
      .filter((key) => /^L\d+$/.test(key))
      .toSorted((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    const lowColor = chartDim(0);
    const highColor = chartUp();
    const layerColor = (index: number) =>
      layerKeys.length <= 1
        ? highColor
        : mixHex(lowColor, highColor, index / (layerKeys.length - 1));

    const layerSeries = layerKeys.map((key, index) => ({
      name: key,
      type: "line" as const,
      data: nav[key] ?? [],
      smooth: true,
      symbol: "none",
      lineStyle: { color: layerColor(index), width: 1.5 },
    }));
    const longShortSeries = nav.longShort
      ? [
          {
            name: "多空",
            type: "line" as const,
            data: nav.longShort,
            smooth: true,
            symbol: "none",
            lineStyle: { color: chartEquity(), width: 2.5 },
          },
        ]
      : [];

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross" },
          valueFormatter: (value: unknown) =>
            typeof value === "number" ? value.toFixed(4) : String(value ?? "-"),
        },
        legend: {
          type: "scroll",
          bottom: 0,
          textStyle: { color: chartAxisText() },
        },
        grid: { left: 56, right: 24, top: 20, bottom: 44 },
        xAxis: {
          type: "category",
          data: dates,
          ...axisLineStyle(),
          axisLabel: { ...axisLabelStyle() },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          name: "净值",
          nameTextStyle: axisLabelStyle(),
          axisLabel: { color: chartAxisText() },
          scale: true,
          ...splitLineStyle(),
        },
        series: [...layerSeries, ...longShortSeries],
      },
      { notMerge: true },
    );
  }, [dates, nav]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 360,
        minHeight: 0,
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
