import { useEffect, useMemo, useRef } from "react";
import type { ECharts, TooltipComponentFormatterCallbackParams } from "echarts";
import { EmptyState } from "@preline-ui/EmptyState";
import { echarts } from "../../lib/echarts";
import {
  axisLabelStyle,
  axisLineStyle,
  chartAxisText,
  chartCurrent,
  splitLineStyle,
} from "../../lib/theme";
import {
  canRenderMarketChart,
  type MarketChart,
} from "../../lib/market-brief";

export interface MarketAssetChartProps {
  chart: MarketChart;
  subjectName: string;
  compact?: boolean;
}

function axisTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5, 16);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function MarketAssetChart({
  chart,
  subjectName,
  compact = false,
}: MarketAssetChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const renderable = canRenderMarketChart(chart);
  const option = useMemo(() => {
    const labels = chart.points.map((point) => axisTime(point.time));
    const hasVolume = chart.hasVolume && chart.points.some((point) => point.volume != null);
    const mainGrid = hasVolume
      ? { left: 10, right: 10, top: compact ? 8 : 16, height: "54%" }
      : { left: 10, right: 10, top: compact ? 8 : 16, bottom: 34 };
    return {
      animation: false,
      grid: hasVolume
        ? [mainGrid, { left: 10, right: 10, height: "16%", bottom: 26 }]
        : [mainGrid],
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "cross" as const },
        confine: true,
        formatter: (params: TooltipComponentFormatterCallbackParams) => {
          if (!Array.isArray(params) || !params[0]) return "";
          const point = chart.points[params[0].dataIndex];
          if (!point) return "";
          const volume =
            point.volume == null
              ? ""
              : `<br/>成交量：${point.volume.toLocaleString("zh-CN")}`;
          return `<strong>${subjectName}</strong><br/>${labels[params[0].dataIndex]}<br/>价格：${point.price.toFixed(2)}${volume}`;
        },
      },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      xAxis: [
        {
          type: "category" as const,
          data: labels,
          boundaryGap: false,
          axisTick: { show: false },
          axisLabel: {
            color: chartAxisText(),
            fontSize: compact ? 10 : 11,
            hideOverlap: true,
          },
          ...axisLineStyle(),
        },
        ...(hasVolume
          ? [
              {
                type: "category" as const,
                gridIndex: 1,
                data: labels,
                boundaryGap: false,
                axisLabel: { show: false },
                axisTick: { show: false },
                ...axisLineStyle(),
              },
            ]
          : []),
      ],
      yAxis: [
        {
          type: "value" as const,
          scale: true,
          axisLabel: {
            color: chartAxisText(),
            fontSize: compact ? 10 : 11,
            formatter: (value: number) => value.toFixed(value >= 1000 ? 0 : 2),
          },
          nameTextStyle: axisLabelStyle(),
          ...splitLineStyle(),
        },
        ...(hasVolume
          ? [
              {
                type: "value" as const,
                gridIndex: 1,
                axisLabel: { show: false },
                splitLine: { show: false },
              },
            ]
          : []),
      ],
      series: [
        {
          name: subjectName,
          type: "line" as const,
          data: chart.points.map((point) => point.price),
          showSymbol: false,
          smooth: 0.18,
          lineStyle: { color: chartCurrent(), width: 2 },
          areaStyle: { opacity: 0.1, color: chartCurrent() },
        },
        ...(hasVolume
          ? [
              {
                name: "成交量",
                type: "bar" as const,
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: chart.points.map((point) => point.volume),
                itemStyle: { color: chartCurrent(), opacity: 0.18 },
              },
            ]
          : []),
      ],
    };
  }, [chart, compact, subjectName]);

  useEffect(() => {
    if (!containerRef.current || !renderable) return;
    const instance = echarts.init(containerRef.current, undefined, { renderer: "svg" });
    chartRef.current = instance;
    instance.setOption(option, { notMerge: true });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chartRef.current = null;
    };
  }, [option, renderable]);

  if (!renderable) {
    return (
      <EmptyState
        title="历史行情不足"
        description={chart.staleReason ?? "至少需要两个有效数据点才能绘制走势。"}
      />
    );
  }

  return (
    <div
      className={compact ? "h-44 w-full" : "h-64 w-full"}
      aria-label={`${subjectName}${chart.range}价格走势${chart.hasVolume ? "和成交量" : ""}`}
      role="img"
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
