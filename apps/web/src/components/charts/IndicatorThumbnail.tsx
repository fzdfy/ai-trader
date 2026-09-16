import { useMemo } from "react";
import type { FactorViz, PaneSpec } from "../../hooks/useScreens";
import { chartSeq, chartMa, chartUp, chartDown, chartGrid } from "../../lib/theme";

/**
 * 指标缩略图 — 纯 SVG 折线/柱状迷你图，用于选股结果列表的「形态」列。
 *
 * 渲染 quant 服务返回的 FactorViz（一个因子 = 一个或多个纵向堆叠的 PaneSpec）。
 * 缺失值（null）在折线中断开；柱状系列按正负着色（红正绿负，符合 A 股惯例）。
 * 仅用 CSS 变量 token，不硬编码颜色。
 */

interface IndicatorThumbnailProps {
  viz: FactorViz;
  /** 缩略图宽度 */
  width?: number;
  /** 单个 pane 的高度 */
  paneHeight?: number;
}

const PAD_X = 4;
const PAD_Y = 3;
const GAP = 2;

/** 均线系列名（如 MA5/MA10/MA20）→ 周期；非均线返回 null */
function maPeriod(name: string): number | null {
  const m = /^MA(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}

/** 把含 null 的序列拆成连续非空片段（[index, value][]），供断线渲染 */
function toSegments(values: (number | null)[]) {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push([i, v]);
    }
  });
  if (current.length) segments.push(current);
  return segments;
}

interface PaneProps {
  pane: PaneSpec;
  width: number;
  height: number;
}

function PaneRenderer({ pane, width, height }: PaneProps) {
  const geom = useMemo(() => {
    const n = pane.series.reduce((m, s) => Math.max(m, s.values.length), 0);
    // 计算取值域（含带状上下轨与参考线；柱状系列强制纳入 0 作基线）
    let min = Infinity;
    let max = -Infinity;
    const visit = (v: number | null) => {
      if (v == null) return;
      if (v < min) min = v;
      if (v > max) max = v;
    };
    pane.series.forEach((s) => s.values.forEach(visit));
    pane.bands.forEach((b) => {
      b.upper.forEach(visit);
      b.lower.forEach(visit);
    });
    pane.refs.forEach(visit);
    if (pane.series.some((s) => s.kind === "bar")) {
      if (0 < min) min = 0;
      if (0 > max) max = 0;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const innerW = width - PAD_X * 2;
    const innerH = height - PAD_Y * 2;
    const x = (i: number) => (n <= 1 ? PAD_X : PAD_X + (i / (n - 1)) * innerW);
    const y = (v: number) => PAD_Y + ((max - v) / (max - min)) * innerH;
    return { n, x, y };
  }, [pane, width, height]);

  const gridColor = chartGrid();
  const barWidth = Math.max(1, (width - PAD_X * 2) / Math.max(geom.n, 1) * 0.7);

  return (
    <g>
      {/* 带状区间（布林带 / 高低通道） */}
      {pane.bands.map((band) => {
        const n = band.upper.length;
        const upper = band.upper.map((v, i) =>
          v == null ? null : `${geom.x(i)},${geom.y(v)}`,
        );
        const lower = band.lower.map((v, i) =>
          v == null ? null : `${geom.x(i)},${geom.y(v)}`,
        );
        const points = [
          ...upper.filter((p): p is string => p != null),
          ...lower.filter((p): p is string => p != null).reverse(),
        ].join(" ");
        if (points.length === 0) return null;
        return (
          <polygon
            key={band.name}
            points={points}
            fill={chartSeq(2)}
            opacity={0.08}
            stroke="none"
          />
        );
      })}

      {/* 水平参考线（如 RSI 30/70） */}
      {pane.refs.map((r) => (
        <line
          key={r}
          x1={PAD_X}
          x2={width - PAD_X}
          y1={geom.y(r)}
          y2={geom.y(r)}
          stroke={gridColor}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      ))}

      {/* 序列：折线 / 柱状 */}
      {pane.series.map((s, si) => {
        if (s.kind === "bar") {
          const y0 = geom.y(0); // 0 已在取值域内，作柱状基线
          return (
            <g key={s.name}>
              {s.values.map((v, i) => {
                if (v == null) return null;
                const y1 = geom.y(v);
                const top = Math.min(y0, y1);
                const h = Math.abs(y1 - y0);
                return (
                  <rect
                    key={i}
                    x={geom.x(i) - barWidth / 2}
                    y={top}
                    width={barWidth}
                    height={h}
                    fill={v >= 0 ? chartUp() : chartDown()}
                  />
                );
              })}
            </g>
          );
        }

        const period = maPeriod(s.name);
        const color = period != null ? chartMa(period) : chartSeq(si + 1);
        const segments = toSegments(s.values);
        return (
          <g key={s.name} fill="none" stroke={color} strokeWidth={1.2}>
            {segments.map((seg, j) => (
              <polyline
                key={j}
                points={seg.map(([i, v]) => `${geom.x(i)},${geom.y(v)}`).join(" ")}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

export function IndicatorThumbnail({ viz, width = 140, paneHeight = 46 }: IndicatorThumbnailProps) {
  const panes = viz.panes;
  const height = panes.length * paneHeight + (panes.length - 1) * GAP;

  if (panes.length === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={viz.label}
      style={{ display: "block" }}
    >
      {panes.map((pane, i) => (
        <g key={pane.title} transform={`translate(0, ${i * (paneHeight + GAP)})`}>
          <PaneRenderer pane={pane} width={width} height={paneHeight} />
        </g>
      ))}
    </svg>
  );
}
