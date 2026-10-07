import { useEffect, useRef } from "react";
import { echarts } from "../../lib/echarts";
import type { ECharts } from "echarts";
import { chartAxisText, chartSeq, axisLabelStyle, axisLineStyle, splitLineStyle } from "../../lib/theme";

interface FactorMonthlyIcPoint {
  month: string;
  ic: number | null;
  rankIc: number | null;
}

interface FactorMonthlyIcChartProps {
  /** 月度 IC / RankIC 序列 */
  points: FactorMonthlyIcPoint[];
}

/**
 * 因子月度 IC 柱状图。
 *
 * 按自然月聚合的截面 IC 与 RankIC，用于观察因子预测能力的月度稳定性：
 * - IC 柱（主序列）
 * - RankIC 柱（对照）
 * - y=0 虚线作为正负信号分界
 */
export function FactorMonthlyIcChart({ points }: FactorMonthlyIcChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

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
    if (!chartRef.current || points.length === 0) return;

    const months = points.map((p) => p.month);
    const ic = points.map((p) => p.ic);
    const rankIc = points.map((p) => p.rankIc);
    const colorIc = chartSeq(1);
    const colorRank = chartSeq(3);

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
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
          data: months,
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
            type: "bar",
            data: ic,
            barMaxWidth: 18,
            itemStyle: { color: colorIc, borderRadius: [2, 2, 0, 0] },
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
            type: "bar",
            data: rankIc,
            barMaxWidth: 18,
            itemStyle: { color: colorRank, borderRadius: [2, 2, 0, 0] },
          },
        ],
      },
      { notMerge: true },
    );
  }, [points]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 280,
        minHeight: 0,
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
