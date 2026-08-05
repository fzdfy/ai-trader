import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export type FundFlowDaily = Record<string, unknown> & {
  date: string;
  close: number | null;
  changePercent: number | null;
  mainNetInflow: number | null;
  superLargeNetInflow: number | null;
  largeNetInflow: number | null;
  mediumNetInflow: number | null;
  smallNetInflow: number | null;
};

interface FundFlowChartProps {
  /** 按日期正序的资金流序列 */
  data: FundFlowDaily[];
}

/** 资金流向明细行：类型 + 颜色 */
const FLOW_TYPES = [
  { key: "superLargeNetInflow", label: "超大单", color: "#ef4444" },
  { key: "largeNetInflow", label: "大单", color: "#f97316" },
  { key: "mediumNetInflow", label: "中单", color: "#eab308" },
  { key: "smallNetInflow", label: "小单", color: "#22c55e" },
] as const;

/**
 * 资金流向图 — 按日分组堆叠柱状图（净流入，单位：元）。
 * 正值为流入（红/橙），负值为流出。
 */
export function FundFlowChart({ data }: FundFlowChartProps) {
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
    if (!chartRef.current || data.length === 0) return;

    const dates = data.map((d) => d.date);

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => {
            if (!Array.isArray(params) || !params[0]) return "";
            const idx = params[0].dataIndex;
            const d = data[idx];
            if (!d) return "";
            const fmt = (v: number | null, unit: string) =>
              v == null ? "-" : `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}${unit}`;
            return [
              `<strong>${d.date}</strong>`,
              `收盘：${d.close ?? "-"}`,
              `涨跌幅：${d.changePercent ?? "-"}%`,
              `<span style="color:#ef4444">超大单净流入：${fmt(d.superLargeNetInflow, "元")}</span>`,
              `<span style="color:#f97316">大单净流入：${fmt(d.largeNetInflow, "元")}</span>`,
              `<span style="color:#eab308">中单净流入：${fmt(d.mediumNetInflow, "元")}</span>`,
              `<span style="color:#22c55e">小单净流入：${fmt(d.smallNetInflow, "元")}</span>`,
            ].join("<br/>");
          },
        },
        legend: {
          data: FLOW_TYPES.map((t) => t.label),
          bottom: 0,
          textStyle: { color: "var(--color-text-secondary, #888)" },
        },
        grid: { left: 70, right: 20, top: 20, bottom: 40 },
        xAxis: {
          type: "category",
          data: dates,
          axisLine: { lineStyle: { color: "var(--color-border, #e0e0e0)" } },
          axisLabel: { color: "var(--color-text-secondary, #888)", fontSize: 10 },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          name: "净流入(元)",
          nameTextStyle: { color: "var(--color-text-secondary, #888)", fontSize: 11 },
          axisLabel: {
            color: "var(--color-text-secondary, #888)",
            formatter: (v: number) => {
              const abs = Math.abs(v);
              if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
              if (abs >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
              return String(v);
            },
          },
          splitLine: { lineStyle: { color: "var(--color-border, #e0e0e0)", type: "dashed" } },
        },
        series: FLOW_TYPES.map((t) => ({
          name: t.label,
          type: "bar",
          stack: "flow",
          data: data.map((d) => d[t.key] ?? 0),
          itemStyle: { color: t.color },
        })),
      },
      { notMerge: true },
    );
  }, [data]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 380,
        minHeight: 0,
        background: "var(--color-surface, #fff)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
