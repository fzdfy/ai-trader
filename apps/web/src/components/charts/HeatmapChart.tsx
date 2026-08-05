import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export interface HeatmapItem {
  name: string;
  code: string;
  /** 面积值（板块=总市值，成分股=成交额） */
  value: number;
  /** 涨跌幅%（颜色） */
  changePercent: number | null;
  turnoverRate: number | null;
  leadingStock?: string | null;
  leadingStockChangePercent?: number | null;
  /** 二级节点：成分股 */
  children?: HeatmapItem[];
}

interface HeatmapChartProps {
  /** 嵌套数据：一级板块（含 children 成分股） */
  data: HeatmapItem[];
}

/** 涨跌幅 → 颜色（红涨绿跌，随幅度加深） */
function pctColor(pct: number | null): string {
  if (pct == null) return "#6b7280";
  const t = Math.min(Math.abs(pct) / 5, 1); // 5% 封顶
  if (pct >= 0) {
    // 红：#fee2e2 → #ef4444
    return `rgba(239, 68, 68, ${0.25 + 0.75 * t})`;
  }
  // 绿：#dcfce7 → #22c55e
  return `rgba(34, 197, 94, ${0.25 + 0.75 * t})`;
}

/** 格式化市值/成交额：万亿/亿 */
function fmtCap(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}万亿`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
  return `${v.toFixed(0)}`;
}

/**
 * 双层热力图（treemap）：板块 + 成分股在一张图内嵌套展示。
 * - 一级：板块（面积=总市值，颜色=板块涨跌幅）
 * - 二级：成分股（面积=成交额，颜色=个股涨跌幅）
 */
export function HeatmapChart({ data }: HeatmapChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: "canvas" });

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

    chartRef.current.setOption(
      {
        animation: false,
        tooltip: {
          formatter: (params: unknown) => {
            const p = params as {
              data?: {
                name?: string;
                value?: number;
                item?: HeatmapItem;
                children?: HeatmapItem[];
              } & Partial<HeatmapItem>;
            };
            const node = (p.data?.item ?? p.data) as HeatmapItem | undefined;
            if (!node) return "";
            const pct = node.changePercent ?? null;
            const pctStr = pct == null ? "-" : `${pct.toFixed(2)}%`;
            const hasChildren = (node.children?.length ?? 0) > 0;
            return [
              `<strong>${node.name}</strong>`,
              hasChildren ? `总市值：${fmtCap(node.value ?? 0)}` : `成交额：${fmtCap(node.value ?? 0)}`,
              `<span style="color:${pctColor(pct)}">涨跌幅：${pctStr}</span>`,
              `换手率：${node.turnoverRate ?? "-"}%`,
              hasChildren && node.leadingStock
                ? `领涨股：${node.leadingStock} (${node.leadingStockChangePercent ?? "-"}%)`
                : "",
            ].filter(Boolean).join("<br/>");
          },
        },
        series: [
          {
            type: "treemap",
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            width: "100%",
            height: "100%",
            top: 0,
            left: 0,
            levels: [
              {
                // 一级：板块
                itemStyle: {
                  borderColor: "rgba(255,255,255,0.7)",
                  borderWidth: 2,
                  gapWidth: 3,
                },
                label: {
                  show: true,
                  fontSize: 12,
                  color: "#fff",
                  textShadowBlur: 3,
                  textShadowColor: "rgba(0,0,0,0.5)",
                },
              },
              {
                // 二级：成分股
                itemStyle: {
                  borderColor: "rgba(255,255,255,0.4)",
                  borderWidth: 1,
                  gapWidth: 1,
                },
                label: {
                  show: true,
                  fontSize: 9,
                  color: "#fff",
                  textShadowBlur: 2,
                  textShadowColor: "rgba(0,0,0,0.6)",
                },
              },
            ],
            data: data.map((board) => ({
              name: board.name,
              value: board.value,
              itemStyle: { color: pctColor(board.changePercent) },
              item: board, // 供 tooltip 使用
              children: (board.children ?? []).map((s) => ({
                name: s.name,
                value: s.value,
                itemStyle: { color: pctColor(s.changePercent) },
                item: s,
              })),
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
        height: 620,
        minHeight: 0,
        background: "var(--color-surface, #fff)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
