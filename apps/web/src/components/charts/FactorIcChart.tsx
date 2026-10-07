import { useEffect, useRef } from "react";
import { echarts, graphic } from "../../lib/echarts";
import type { ECharts } from "echarts";
import {
  chartAxisText,
  chartSeq,
  hexToRgba,
  axisLabelStyle,
  axisLineStyle,
  splitLineStyle,
} from "../../lib/theme";

interface FactorIcPoint {
  date: string;
  ic: number;
  rankIc: number;
}

interface FactorIcChartProps {
  /** 逐日 IC / RankIC 序列 */
  series: FactorIcPoint[];
}

/**
 * 因子 IC 时序图。
 *
 * 每日截面因子值与未来收益的相关系数（IC）及其秩相关（RankIC）随时间变化：
 * - IC 面积折线（主序列）
 * - RankIC 细折线（对照）
 * - y=0 虚线作为正负信号分界
 */
export function FactorIcChart({ series }: FactorIcChartProps) {
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
    if (!chartRef.current || series.length === 0) return;

    const dates = series.map((p) => p.date);
    const ic = series.map((p) => p.ic);
    const rankIc = series.map((p) => p.rankIc);
    const colorIc = chartSeq(1);
    const colorRank = chartSeq(3);

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
          data: ["IC", "RankIC"],
          bottom: 0,
          textStyle: { color: chartAxisText() },
        },
        grid: { left: 56, right: 24, top: 20, bottom: 48 },
        xAxis: {
          type: "category",
          data: dates,
          ...axisLineStyle(),
          axisLabel: { ...axisLabelStyle() },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          name: "相关系数",
          nameTextStyle: axisLabelStyle(),
          axisLabel: { color: chartAxisText() },
          ...splitLineStyle(),
        },
        series: [
          {
            name: "IC",
            type: "line",
            data: ic,
            smooth: true,
            symbol: "none",
            lineStyle: { color: colorIc, width: 2 },
            areaStyle: {
              color: new graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: hexToRgba(colorIc, 0.16) },
                { offset: 1, color: hexToRgba(colorIc, 0.02) },
              ]),
            },
            markLine: {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { color: chartAxisText(), type: "dashed", width: 1 },
              data: [{ yAxis: 0 }],
            },
          },
          {
            name: "RankIC",
            type: "line",
            data: rankIc,
            smooth: true,
            symbol: "none",
            lineStyle: { color: colorRank, width: 1.5 },
          },
        ],
      },
      { notMerge: true },
    );
  }, [series]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 320,
        minHeight: 0,
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
