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
  return value ? resolveColor(value) : fallback;
}

/**
 * 将 light-dark() 解析为实际颜色。
 * getComputedStyle 读取自定义属性时返回原始 token 流，light-dark() 不会
 * 被浏览器解析成具体颜色（canvas/echarts 无法识别），需手动解析。
 * 项目当前为浅色主题（body 白底），统一取 light 分支。
 */
function resolveColor(value: string): string {
  const v = value.trim();
  if (!v.startsWith("light-dark(") || !v.endsWith(")")) return v;
  const inner = v.slice("light-dark(".length, -1);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "," && depth === 0) return inner.slice(0, i).trim();
  }
  return v;
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

/** 均线标准色（通达信/同花顺惯例：MA5 白、MA10 黄、MA20 紫、MA30 绿、MA60 蓝） */
const MA_FALLBACK: Record<number, string> = {
  5: "#1a1a1a",
  10: "#d4a017",
  20: "#9a4dff",
  30: "#2e9e5b",
  60: "#2f6fe0",
  120: "#808080",
  250: "#e5484d",
};
export const chartMa = (period: number) =>
  cssVar(`--chart-ma-${period}`, MA_FALLBACK[period] ?? "#8a8f98");

/** 得分维度色板（主线六维 / 板块子指标 / 情绪维度共用） */
export const chartDim = (i: number) =>
  cssVar(
    `--chart-dim-${i}`,
    ["#4c8dff", "#e5484d", "#f5a623", "#30a46c", "#9a6bff", "#1ca0b8"][i] ?? "#8a8f98",
  );

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
