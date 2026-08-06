import { useEffect, useRef } from "react";
import { echarts } from "../../lib/echarts";
import type { ECharts } from "echarts";
import { chartDown, chartFlat, chartUp, hexToRgba } from "../../lib/theme";

export type HeatmapItem = {
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
  /** 成分股所属板块（组件组装时挂载，board 层点击成分股时取回板块 node） */
  board?: HeatmapItem;
} & Record<string, unknown>;

/** 热力图层级：board = 1 级行业/板块热力图，stock = 2 级成分股热力图 */
export type HeatmapLevel = "board" | "stock";

interface HeatmapChartProps {
  /** 热力图数据（board 层：板块列表含 children；stock 层：成分股列表） */
  data: HeatmapItem[];
  /** 层级标识：决定点击回调（board → onBoardClick 下钻；stock → onStockClick 跳转个股） */
  level: HeatmapLevel;
  /** 点击 1 级板块格子回调（下钻看成分股热力图） */
  onBoardClick?: (item: HeatmapItem) => void;
  /** 点击 2 级成分股格子回调（跳转个股详情） */
  onStockClick?: (item: HeatmapItem) => void;
}

/** 涨跌幅 → 颜色（红涨绿跌，随幅度加深） */
function pctColor(pct: number | null): string {
  if (pct == null) return chartFlat();
  const t = Math.min(Math.abs(pct) / 5, 1); // 5% 封顶
  if (pct >= 0) {
    return hexToRgba(chartUp(), 0.25 + 0.75 * t);
  }
  return hexToRgba(chartDown(), 0.25 + 0.75 * t);
}

/** 格式化市值/成交额：万亿/亿 */
function fmtCap(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}万亿`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
  return `${v.toFixed(0)}`;
}

/**
 * 点击处理：使用 echarts 官方 click 事件（params 自带 dataIndex）。
 * - 为什么能命中名称文字：echarts 的事件分发沿 __hostTarget 链向上查找数据元素，
 *   点击 label 文字同样能拿到 dataIndex（见 echarts findEventDispatcher）。
 * - 用 level 标识决定走哪个回调，不做任何位置/层级搜索。
 * - board 层点击到成分股时：成分股 item 上挂有 board 引用（组装数据时写入），
 *   直接取回所属板块 node 作为回调参数，不依赖 tree 祖先查找。
 */
function pressedItem(
  chart: ECharts,
  params: unknown,
  level: HeatmapLevel,
): HeatmapItem | undefined {
  const p = params as { dataIndex?: number; seriesIndex?: number };
  if (p.dataIndex == null) return undefined;
  const series = (
    chart as unknown as {
      getModel: () => {
        getSeriesByIndex: (i: number) => {
          getData: () => { getRawDataItem: (i: number) => unknown };
          getRawData?: () => {
            tree?: {
              eachNode: (fn: (n: unknown) => void) => void;
            };
          };
        };
      };
    }
  )
    .getModel()
    .getSeriesByIndex(p.seriesIndex ?? 0);
  const raw = series?.getData().getRawDataItem(p.dataIndex);
  const item =
    (raw as HeatmapItem & { item?: HeatmapItem })?.item ?? (raw as HeatmapItem | undefined);
  if (!item?.name) return undefined;

  // board 层：命中成分股时返回其所属板块 node（组装数据时已在成分股 item 上挂 board 引用）；
  // 命中板块本体时返回自身
  if (level === "board") {
    const boardNode = (item as HeatmapItem & { board?: HeatmapItem }).board;
    if (boardNode?.name) return boardNode;
  }
  return item;
}

/**
 * 双层热力图（treemap）：板块 + 成分股在一张图内嵌套展示。
 * - 一级：板块（面积=总市值，颜色=板块涨跌幅）
 * - 二级：成分股（面积=成交额，颜色=个股涨跌幅）
 *
 * 交互：用 level 标识决定回调——
 *   level="board"：点击板块格子任意位置 → onBoardClick（下钻成分股热力图）
 *   level="stock"：点击成分股格子 → onStockClick（跳转个股详情）
 */
export function HeatmapChart({ data, level, onBoardClick, onStockClick }: HeatmapChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const onBoardClickRef = useRef(onBoardClick);
  onBoardClickRef.current = onBoardClick;
  const onStockClickRef = useRef(onStockClick);
  onStockClickRef.current = onStockClick;

  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = echarts.init(containerRef.current, undefined, { renderer: "canvas" });

    const chart = chartRef.current;
    const handlePress = (params: unknown) => {
      const node = pressedItem(chart, params, levelRef.current);
      if (!node) return;
      // 用 level 标识决定走哪个回调，不再按 children 判断
      if (levelRef.current === "board") onBoardClickRef.current?.(node);
      else onStockClickRef.current?.(node);
    };
    chart.on("click", handlePress);

    const handleResize = () => chartRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.off("click", handlePress);
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
              hasChildren
                ? `总市值：${fmtCap(node.value ?? 0)}`
                : `成交额：${fmtCap(node.value ?? 0)}`,
              `<span style="color:${pctColor(pct)}">涨跌幅：${pctStr}</span>`,
              `换手率：${node.turnoverRate ?? "-"}%`,
              hasChildren && node.leadingStock
                ? `领涨股：${node.leadingStock} (${node.leadingStockChangePercent ?? "-"}%)`
                : "",
            ]
              .filter(Boolean)
              .join("<br/>");
          },
        },
        series: [
          {
            type: "treemap",
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            // 全嵌套显示：一级板块 + 二级成分股
            width: "100%",
            height: "100%",
            top: 0,
            left: 0,
            levels: [
              {
                // 一级：板块（名称+涨跌幅在 title，格子内不重复显示 label）
                itemStyle: {
                  borderColor: "rgba(255,255,255,0.7)",
                  borderWidth: 2,
                  gapWidth: 3,
                },
                title: {
                  show: true,
                  top: 0,
                  textAlign: "left",
                  fontSize: 12,
                  color: "#fff",
                  textShadowBlur: 3,
                  textShadowColor: "rgba(0,0,0,0.5)",
                  formatter: (params: { data?: { item?: HeatmapItem } }) => {
                    const it = params.data?.item;
                    const pct = it?.changePercent;
                    return `${it?.name ?? ""}${pct != null ? `  ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : ""}`;
                  },
                },
                label: { show: false },
              },
              {
                // 二级：成分股（名称+涨跌幅在 label）
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
                  formatter: (params: { data?: { item?: HeatmapItem } }) => {
                    const it = params.data?.item;
                    const pct = it?.changePercent;
                    return `${it?.name ?? ""}${pct != null ? `\n${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : ""}`;
                  },
                },
              },
            ],
            data: data.map((board) => ({
              name: board.name,
              value: board.value,
              itemStyle: { color: pctColor(board.changePercent) },
              item: board, // 供 tooltip / 点击命中使用
              children: (board.children ?? []).map((s) => ({
                name: s.name,
                value: s.value,
                itemStyle: { color: pctColor(s.changePercent) },
                // 成分股 item 挂 board 引用：board 层点击成分股时取回所属板块 node
                item: { ...s, board },
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
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-md, 8px)",
      }}
    />
  );
}
