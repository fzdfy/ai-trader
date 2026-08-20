import { useEffect, useRef } from "react";
import { echarts } from "../../lib/echarts";
import type { ECharts, TooltipComponentFormatterCallbackParams } from "echarts";
import {
  chartAxisText,
  chartUp,
  chartDown,
  axisLabelStyle,
  axisLineStyle,
  splitLineStyle,
} from "../../lib/theme";
import type { SectorFlowItem } from "../../hooks/useReviews";
import { fmtFlow } from "../../lib/format";

interface SectorFundFlowChartProps {
  /** 行业资金流快照（复盘接口返回，已按主力净流入降序） */
  data: SectorFlowItem[];
}

/**
 * 行业资金流向图 — 横向条形图，展示 TOP 20 行业主力净流入。
 * 流入红 / 流出绿（A 股资金流惯例），用于复盘判断当日资金主线。
 */
export function SectorFundFlowChart({ data }: SectorFundFlowChartProps) {
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
    if (!chartRef.current || data.length === 0) return;

    // 按主力净流入降序取前 20，再反转以让最大值显示在最上方
    const sorted = [...data]
      .sort((a, b) => (b.mainNetInflow ?? 0) - (a.mainNetInflow ?? 0))
      .slice(0, 20)
      .reverse();

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: TooltipComponentFormatterCallbackParams) => {
            if (!Array.isArray(params) || !params[0]) return "";
            const idx = params[0].dataIndex;
            const d = sorted[idx];
            if (!d) return "";
            return [
              `<strong>${d.name}</strong>`,
              `主力净流入：${fmtFlow(d.mainNetInflow)}`,
              `净占比：${d.mainNetInflowPercent ?? "-"}%`,
              `涨跌幅：${d.changePercent ?? "-"}%`,
              d.topStockName ? `领涨股：${d.topStockName}` : "",
            ]
              .filter(Boolean)
              .join("<br/>");
          },
        },
        grid: { left: 84, right: 60, top: 10, bottom: 24 },
        xAxis: {
          type: "value",
          axisLabel: {
            color: chartAxisText(),
            formatter: (v: number) => {
              const abs = Math.abs(v);
              if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
              if (abs >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
              return String(v);
            },
          },
          ...splitLineStyle,
        },
        yAxis: {
          type: "category",
          data: sorted.map((d) => d.name),
          axisLabel: { color: chartAxisText(), fontSize: 11 },
          axisTick: { show: false },
          ...axisLineStyle,
        },
        series: [
          {
            type: "bar",
            barMaxWidth: 16,
            data: sorted.map((d) => ({
              value: d.mainNetInflow ?? 0,
              itemStyle: { color: (d.mainNetInflow ?? 0) >= 0 ? chartUp() : chartDown() },
            })),
          },
        ],
      },
      { notMerge: true },
    );
  }, [data]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: Math.max(320, Math.min(560, data.length * 26)),
        minHeight: 0,
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
