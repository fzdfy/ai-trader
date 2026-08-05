import { useEffect, useRef } from "react";
import { echarts } from "../../lib/echarts";
import type { ECharts, TooltipComponentFormatterCallbackParams } from "echarts";
import {
  chartAxisText,
  chartFlat,
  chartGain,
  chartGrid,
  chartLoss,
  axisLabelStyle,
  splitLineStyle,
} from "../../lib/theme";

interface TradePoint {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
}

interface TradeChartProps {
  trades: TradePoint[];
}

/**
 * 交易盈亏分布图。
 *
 * 参考 AKQuant 报告中的 Trade Analysis：
 * - 柱状图：每笔交易的收益率
 * - 颜色区分盈利(绿) 和 亏损(红)
 * - 标记线显示平均盈亏
 */
export function TradeChart({ trades }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current || trades.length === 0) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, undefined, { renderer: "svg" });
    }

    const labels = trades.map((_, i) => `#${i + 1}`);
    const pnlData = trades.map((t) => t.pnlPct);
    const avgPnl = pnlData.reduce((a, b) => a + b, 0) / pnlData.length;

    // 颜色：盈利为绿，亏损为红
    const colors = pnlData.map((v) => (v >= 0 ? chartGain() : chartLoss()));

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: TooltipComponentFormatterCallbackParams) => {
            if (!Array.isArray(params) || !params[0]) return "";
            const idx = params[0].dataIndex;
            const t = trades[idx];
            if (!t) return "";
            return [
              `<strong>交易 #${idx + 1}</strong>`,
              `买入日：${t.entryTime}`,
              `卖出日：${t.exitTime}`,
              `买入价：${t.entryPrice}`,
              `卖出价：${t.exitPrice}`,
              `收益率：${t.pnlPct.toFixed(2)}%`,
            ].join("<br/>");
          },
        },
        grid: { left: 50, right: 20, top: 20, bottom: 30 },
        xAxis: {
          type: "category",
          data: labels,
          axisLabel: { show: false },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          name: "收益率(%)",
          nameTextStyle: axisLabelStyle,
          axisLabel: {
            color: chartAxisText(),
            formatter: "{value}%",
          },
          ...splitLineStyle,
        },
        series: [
          {
            type: "bar",
            data: pnlData.map((v, i) => ({
              value: v,
              itemStyle: { color: colors[i], borderRadius: [2, 2, 0, 0] },
            })),
            markLine: {
              silent: true,
              symbol: "none",
              lineStyle: { color: chartFlat(), type: "dashed", width: 1 },
              data: [
                {
                  yAxis: avgPnl,
                  label: {
                    formatter: `均 ${avgPnl.toFixed(2)}%`,
                    color: chartAxisText(),
                    fontSize: 11,
                  },
                },
                {
                  yAxis: 0,
                  lineStyle: { color: chartGrid(), width: 1 },
                  label: { show: false },
                },
              ],
            },
          },
        ],
      },
      { notMerge: true },
    );

    const handleResize = () => chartRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [trades]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 300,
        minHeight: 0,
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
