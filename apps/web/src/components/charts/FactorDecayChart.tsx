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

export interface FactorDecayPointInput {
  horizon: number;
  ic: number | null;
  rankIc: number | null;
}

/** 多因子叠加模式下的一条曲线（因子名 + 其衰退点） */
export interface FactorDecaySeries {
  name: string;
  points: FactorDecayPointInput[];
}

interface FactorDecayChartProps {
  /** 单因子模式：不同持有期（升序）下的预测能力 */
  points?: FactorDecayPointInput[];
  /** 多因子叠加模式：每个因子一条曲线（与 points 二选一，factors 优先） */
  factors?: FactorDecaySeries[];
  /** 多因子模式展示的指标：|IC| 或 |RankIC| */
  metric?: "ic" | "rankIc";
  /** |IC| 参考线：低于该值视为无预测力 */
  threshold?: number;
}

const VALUE_FORMATTER = (value: unknown) =>
  typeof value === "number" ? value.toFixed(4) : String(value ?? "-");

/** 单因子模式：同一因子两条曲线（|IC| 带面积、|RankIC|） */
function buildSingleOption(points: FactorDecayPointInput[], threshold: number) {
  const horizons = points.map((p) => `${p.horizon} 日`);
  const absIc = points.map((p) => (p.ic == null ? null : Math.abs(p.ic)));
  const absRankIc = points.map((p) => (p.rankIc == null ? null : Math.abs(p.rankIc)));
  const colorIc = chartSeq(1);
  const colorRank = chartSeq(3);

  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      valueFormatter: VALUE_FORMATTER,
    },
    legend: {
      data: ["|IC|", "|RankIC|"],
      bottom: 0,
      textStyle: { color: chartAxisText() },
    },
    grid: { left: 56, right: 24, top: 28, bottom: 48 },
    xAxis: {
      type: "category",
      data: horizons,
      ...axisLineStyle(),
      axisLabel: { ...axisLabelStyle() },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      name: "预测能力 |IC|",
      nameTextStyle: axisLabelStyle(),
      axisLabel: { color: chartAxisText() },
      min: 0,
      ...splitLineStyle(),
    },
    series: [
      {
        name: "|IC|",
        type: "line",
        data: absIc,
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { color: colorIc, width: 2 },
        itemStyle: { color: colorIc },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: hexToRgba(colorIc, 0.16) },
            { offset: 1, color: hexToRgba(colorIc, 0.02) },
          ]),
        },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: chartAxisText(), type: "dashed", width: 1 },
          label: {
            show: true,
            position: "insideEndTop",
            formatter: `可用线 ${threshold}`,
            color: chartAxisText(),
            fontSize: 11,
          },
          data: [{ yAxis: threshold }],
        },
      },
      {
        name: "|RankIC|",
        type: "line",
        data: absRankIc,
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: colorRank, width: 1.5 },
        itemStyle: { color: colorRank },
      },
    ],
  };
}

/** 多因子叠加模式：每个因子一条曲线，横轴取所有因子持有期的并集 */
function buildMultiOption(
  factors: FactorDecaySeries[],
  metric: "ic" | "rankIc",
  threshold: number,
) {
  const horizons = [
    ...new Set(factors.flatMap((f) => f.points.map((p) => p.horizon))),
  ].toSorted((a, b) => a - b);
  const categories = horizons.map((h) => `${h} 日`);

  const series = factors.map((factor, i) => {
    const color = chartSeq((i % 6) + 1);
    const byHorizon = new Map(factor.points.map((p) => [p.horizon, p]));
    const data = horizons.map((h) => {
      const point = byHorizon.get(h);
      if (!point) return null;
      const value = metric === "rankIc" ? point.rankIc : point.ic;
      return value == null ? null : Math.abs(value);
    });
    return {
      name: factor.name,
      type: "line" as const,
      data,
      smooth: true,
      connectNulls: true,
      symbol: "circle",
      symbolSize: 5,
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      ...(i === 0
        ? {
            markLine: {
              silent: true,
              symbol: "none",
              lineStyle: { color: chartAxisText(), type: "dashed" as const, width: 1 },
              label: {
                show: true,
                position: "insideEndTop" as const,
                formatter: `可用线 ${threshold}`,
                color: chartAxisText(),
                fontSize: 11,
              },
              data: [{ yAxis: threshold }],
            },
          }
        : {}),
    };
  });

  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      valueFormatter: VALUE_FORMATTER,
    },
    legend: {
      type: "scroll",
      data: factors.map((f) => f.name),
      bottom: 0,
      textStyle: { color: chartAxisText() },
    },
    grid: { left: 56, right: 24, top: 28, bottom: 56 },
    xAxis: {
      type: "category",
      data: categories,
      ...axisLineStyle(),
      axisLabel: { ...axisLabelStyle() },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      name: metric === "rankIc" ? "预测能力 |RankIC|" : "预测能力 |IC|",
      nameTextStyle: axisLabelStyle(),
      axisLabel: { color: chartAxisText() },
      min: 0,
      ...splitLineStyle(),
    },
    series,
  };
}

/**
 * 因子衰退曲线（term structure）。
 *
 * 横轴为持有期，纵轴取 |IC| / |RankIC|（只看强度、不看方向），
 * 曲线随持有期下滑越快，说明信号越短命；单位持有期处的高低与斜率共同决定可用性。
 * 取绝对值是因为因子方向已由「方向」字段表达，此处关注的是预测能力本身。
 *
 * - 单因子模式：传 `points`，画出该因子 |IC| / |RankIC| 两条曲线（详情页）。
 * - 多因子叠加模式：传 `factors` + `metric`，每个因子一条曲线（跨因子对比页）。
 */
export function FactorDecayChart({
  points,
  factors,
  metric = "ic",
  threshold = 0.02,
}: FactorDecayChartProps) {
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
    const chart = chartRef.current;
    if (!chart) return;

    if (factors && factors.length > 0) {
      chart.setOption(buildMultiOption(factors, metric, threshold), { notMerge: true });
      return;
    }
    if (points && points.length > 0) {
      chart.setOption(buildSingleOption(points, threshold), { notMerge: true });
    }
  }, [points, factors, metric, threshold]);

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
