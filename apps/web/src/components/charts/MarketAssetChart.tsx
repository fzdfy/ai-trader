import { useEffect, useMemo, useRef, useState } from "react";
import type { ECharts, TooltipComponentFormatterCallbackParams } from "echarts";
import { EmptyState } from "@preline-ui/EmptyState";
import { useAppTheme } from "../AppThemeProvider";
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
  moveChartPoint,
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
  const [keyboardIndex, setKeyboardIndex] = useState<number | null>(null);
  const { mode, preset } = useAppTheme();
  const renderable = canRenderMarketChart(chart);
  const activeIndex =
    keyboardIndex == null
      ? chart.points.length - 1
      : Math.max(0, Math.min(keyboardIndex, chart.points.length - 1));
  const activePoint = renderable ? chart.points[activeIndex] : null;
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
  }, [chart, compact, mode, preset.accent, subjectName]);

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

  useEffect(() => {
    setKeyboardIndex(chart.points.length > 0 ? chart.points.length - 1 : null);
  }, [chart.points.length, chart.range, chart.symbol]);

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
      className={`${compact ? "h-44 w-full" : "h-64 w-full"} focus-ring rounded-xl`}
      aria-label={`${subjectName}${chart.range}价格走势${chart.hasVolume ? "和成交量" : ""}，使用左右方向键查看数据点`}
      role="group"
      tabIndex={0}
      onFocus={() => {
        if (activeIndex >= 0) {
          chartRef.current?.dispatchAction({
            type: "showTip",
            seriesIndex: 0,
            dataIndex: activeIndex,
          });
        }
      }}
      onBlur={() => chartRef.current?.dispatchAction({ type: "hideTip" })}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = moveChartPoint(
          chart.points.length,
          activeIndex,
          event.key as "ArrowLeft" | "ArrowRight" | "Home" | "End",
        );
        if (next < 0) return;
        setKeyboardIndex(next);
        chartRef.current?.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: next });
      }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {activePoint ? (
        <span className="sr-only" aria-live="polite">
          {axisTime(activePoint.time)}，价格 {activePoint.price.toFixed(2)}
        </span>
      ) : null}
    </div>
  );
}
