import { useEffect, useRef } from "react";
import { echarts, graphic } from "../../lib/echarts";
import type { ECharts, TooltipComponentFormatterCallbackParams } from "echarts";
import {
  chartAxisText,
  chartEquity,
  chartLoss,
  hexToRgba,
  axisLabelStyle,
  axisLineStyle,
  splitLineStyle,
} from "../../lib/theme";

interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

interface EquityChartProps {
  equity: EquityPoint[];
  /** 初始资金，用于计算累计收益率(%) 纵轴 */
  initialCapital?: number;
}

/**
 * 权益曲线 & 回撤图。
 *
 * 参考 AKQuant 报告风格：
 * - 上方：累计收益率面积曲线（基于 initialCapital 计算）
 * - 下方：回撤面积图（红色负值区域，优先使用后端 drawdown 字段）
 * - 双图联动 crosshair tooltip
 */
export function EquityChart({ equity, initialCapital }: EquityChartProps) {
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
    if (!chartRef.current || equity.length === 0) return;

    const dates = equity.map((p) => p.time);
    const navs = equity.map((p) => p.equity);
    const capital = initialCapital ?? navs[0] ?? 0;

    // 回撤序列：优先用后端预计算的 drawdown（已为负值%），否则前端自行计算兜底
    const hasBackendDd = equity.some((p) => p.drawdown != null && p.drawdown !== 0);
    let drawdowns: number[];
    if (hasBackendDd) {
      drawdowns = equity.map((p) => p.drawdown);
    } else {
      drawdowns = [];
      let peak = 0;
      for (const v of navs) {
        if (v > peak) peak = v;
        drawdowns.push(peak > 0 ? -((peak - v) / peak) * 100 : 0);
      }
    }

    // 累计收益率(%)，以初始资金为基准
    const returns = navs.map((v) => (capital > 0 ? ((v - capital) / capital) * 100 : 0));

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross" },
          formatter: (params: TooltipComponentFormatterCallbackParams) => {
            if (!Array.isArray(params)) return "";
            const first = params[0] as { axisValue?: string; dataIndex?: number } | undefined;
            const date = first?.axisValue ?? "";
            const idx = first?.dataIndex ?? 0;
            const eq = navs[idx];
            const retVal = returns[idx];
            const ddVal = drawdowns[idx];
            return [
              `<strong>${date}</strong>`,
              `权益：${eq != null ? eq.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"} 元`,
              `累计收益率：${retVal != null ? retVal.toFixed(2) : "-"}%`,
              `回撤：${ddVal != null ? ddVal.toFixed(2) : "-"}%`,
            ].join("<br/>");
          },
        },
        legend: {
          data: ["累计收益率", "回撤"],
          bottom: 0,
          textStyle: { color: chartAxisText() },
        },
        grid: [
          { left: 60, right: 60, top: 20, height: "55%" },
          { left: 60, right: 60, top: "75%", height: "15%" },
        ],
        xAxis: [
          {
            type: "category",
            data: dates,
            gridIndex: 0,
            ...axisLineStyle,
            axisLabel: { ...axisLabelStyle },
            axisTick: { show: false },
          },
          {
            type: "category",
            data: dates,
            gridIndex: 1,
            ...axisLineStyle,
            axisLabel: { show: false },
            axisTick: { show: false },
          },
        ],
        yAxis: [
          {
            type: "value",
            gridIndex: 0,
            name: "收益率(%)",
            nameTextStyle: axisLabelStyle,
            axisLabel: {
              color: chartAxisText(),
              formatter: "{value}%",
            },
            ...splitLineStyle,
          },
          {
            type: "value",
            gridIndex: 1,
            name: "回撤(%)",
            nameTextStyle: axisLabelStyle,
            axisLabel: {
              color: chartAxisText(),
              formatter: "{value}%",
            },
            ...splitLineStyle,
          },
        ],
        series: [
          {
            name: "累计收益率",
            type: "line",
            data: returns,
            xAxisIndex: 0,
            yAxisIndex: 0,
            smooth: true,
            symbol: "none",
            lineStyle: { color: chartEquity(), width: 2 },
            areaStyle: {
              color: new graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: hexToRgba(chartEquity(), 0.15) },
                { offset: 1, color: hexToRgba(chartEquity(), 0.02) },
              ]),
            },
          },
          {
            name: "回撤",
            type: "line",
            data: drawdowns,
            xAxisIndex: 1,
            yAxisIndex: 1,
            smooth: true,
            symbol: "none",
            lineStyle: { color: chartLoss(), width: 1.5 },
            areaStyle: { color: hexToRgba(chartLoss(), 0.12) },
          },
        ],
      },
      { notMerge: true },
    );
  }, [equity, initialCapital]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 420,
        minHeight: 0,
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
