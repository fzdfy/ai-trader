/**
 * 主题工具 — 从 CSS 变量读取图表语义色。
 *
 * 所有图表组件统一通过 `cssVar()` 读取 index.css 定义的 token
 * （--chart-up / --chart-down / --chart-grid ...），禁止硬编码颜色。
 * 支持 light-dark() 值（由浏览器按 color-scheme 解析）。
 */

/** 读取 CSS 变量，未定义时回退 fallback */
export function cssVar(name: string, fallback: string): string {
  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  return value || fallback;
}

/** 将 #rrggbb 转为 rgba() 字符串（用于渐变/面积填充） */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1] ?? "000000", 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 行情语义色：A 股红涨绿跌 */
export const chartUp = () => cssVar("--chart-up", "#e5484d");
export const chartDown = () => cssVar("--chart-down", "#30a46c");
export const chartFlat = () => cssVar("--chart-flat", "#8a8f98");

/** 盈亏语义色：盈绿亏红 */
export const chartGain = () => cssVar("--chart-gain", "#30a46c");
export const chartLoss = () => cssVar("--chart-loss", "#e5484d");

/** 图表框架 */
export const chartGrid = () => cssVar("--chart-grid", "#ececec");
export const chartAxisText = () => cssVar("--chart-axis-text", "#8a8f98");
export const chartCurrent = () => cssVar("--chart-current", "#f5a623");

/** 序列色板 */
export const chartSeq = (i: number) =>
  cssVar(`--chart-seq-${i}`, ["#e5484d", "#f76b15", "#f5a623", "#30a46c"][i - 1] ?? "#8a8f98");

/** 权益主色 */
export const chartEquity = () => cssVar("--chart-equity", "#0d4a3a");

/**
 * echarts 通用轴样式（虚线网格 + 次级文字），各图表复用保证视觉统一。
 */
export const axisLabelStyle = {
  color: chartAxisText(),
  fontSize: 11,
} as const;

export const splitLineStyle = {
  lineStyle: { color: chartGrid(), type: "dashed" as const },
} as const;

export const axisLineStyle = {
  lineStyle: { color: chartGrid() },
} as const;
