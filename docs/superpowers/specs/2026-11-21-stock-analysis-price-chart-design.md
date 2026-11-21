# 个股分析价格趋势图设计

## Context

当前“价格与趋势”由 `StockAnalysisDetail.tsx` 内部的一个轻量 SVG 直接绘制：

- 数据来自现有 `GET /api/v1/stock-analysis/:symbol` 的 `prices.data`，不需要新增接口。
- 纵轴范围使用开高低价，曲线只画收盘价；视觉口径与“K 线”标签不一致。
- 没有均线叠加、支撑压力线、横轴刻度、十字线或键盘浏览。
- 页面已有轻量 SVG 方案，没有引入 ECharts 或 klinecharts 的必要。

用户已确认以下设计稿：

- 原型：`docs/design/prototypes/explorations/quant-workbench-stock-chart-v2.html`
- 截图：`docs/design/prototypes/explorations/screenshots/stock-chart-v2/final-v3-*`
- 确认日期：2026-11-21

## Goals

- 准确表达“前复权收盘价趋势”，不再让用户误以为是 K 线。
- 在同一尺度内展示收盘价、MA20、MA60、20 日支撑和 60 日压力。
- 横轴严格按交易日索引排列，使用五个 `MM-DD` 刻度。
- 鼠标、触控、键盘和屏幕阅读器可以检查同一交易日的完整数据。
- 保持现有 API、复权口径、页面加载/错误逻辑和依赖不变。

## Non-Goals

- 不新增真正的蜡烛 K 线、成交量副图或缩放平移。
- 不修改后端价格查询、复权计算、数据库或数据源链路。
- 不改变 MA20、MA60、支撑和压力的服务端计算口径。
- 不引入图表库、动画库或新的全局状态。

## Visual Design

视觉方向沿用已确认原型：低噪声的金融工作台、蓝色收盘价主线、紫色/青色均线、绿色支撑、红色压力、轻网格与可读的浮层。

状态覆盖：

- 成功：收盘价、MA20、MA60、支撑和压力同时存在。
- 部分成功：技术指标不可用时仍显示收盘价和交易日横轴，显示“技术指标待生成”。
- 空态：少于两个交易日时复用现有 `EmptyState`，文案为“历史行情不足”。
- 加载：沿用页面级骨架，不单独显示不完整图表。
- 错误：沿用页面级“个股分析暂时无法读取”卡片，不重复展示图表错误。
- 交互：默认态与选中态共用同一布局；选中态增加十字线、点标记和提示框。
- 响应式：桌面 `760 × 280`，移动端 `420 × 320`；移动端图例自然换行，页脚预留右侧悬浮按钮安全区。
- 主题：浅色和深色均使用 Preline 语义变量 `--chart-current`、`--chart-ma-20`、`--chart-ma-60`、`--chart-up`、`--chart-down`、`--chart-grid`、`--chart-axis-text`。

## Architecture

### Component boundary

新增：

```text
apps/web/src/components/charts/PriceTrendChart.tsx
apps/web/src/lib/price-trend-chart.ts
apps/web/src/lib/price-trend-chart.test.ts
```

`PriceTrendChart` 负责：

- 解析桌面/移动端 viewport。
- 维护悬停索引、固定选中索引和键盘索引。
- 渲染 SVG、图例、提示框、屏幕阅读器读数及隐藏数据表。

`price-trend-chart.ts` 负责无 UI 副作用的计算：

- 开收盘价序列的 MA20/MA60。
- 5 个等距交易日横轴索引。
- 纵轴范围与坐标映射。
- 提示框边界约束。
- 指针位置到交易日索引的映射，以及鼠标/键盘共用的选择状态归约。

`StockAnalysisDetail.tsx` 只负责模块标题、状态标签、指标摘要、空态文案和挂载图表组件，不再内嵌图表算法。

### Data contract

图表输入保持结构化且不绑定 API 模块类型：

```ts
interface PriceTrendPoint {
  time: string;
  close: number;
}

interface PriceTrendReference {
  ma20: number | null;
  ma60: number | null;
  support20: number | null;
  resistance60: number | null;
}

type PriceTrendViewport = "desktop" | "mobile";
```

均线曲线从当前展示的收盘价窗口计算；均线和参考线的可见性由技术指标是否存在统一控制。技术指标缺失时不画 MA 和支撑压力线，但仍保留收盘价。

### Geometry

- 桌面：`760 × 280`，`left=50`、`right=18`、`top=20`、`bottom=42`。
- 移动端：`420 × 320`，`left=40`、`right=18`、`top=20`、`bottom=42`。
- 视口断点与确认原型一致：`640px` 及以下使用移动端几何。
- `x(index)` 使用交易日索引线性映射。
- 五个横轴位置使用 `round((n - 1) * position / 4)`，去重并保持排序。
- `MM-DD` 与完整日期直接格式化 API 返回的日期字符串，禁止经由 `new Date()` 做本地时区换算。
- 纵轴包含收盘价、可见均线、支撑和压力，并增加序列跨度 4% 的上下留白。
- 提示框横向位置限制在绘图区内，避免贴边裁切。

### Interaction state

```text
hoverIndex: number | null
pinnedIndex: number | null
keyboardIndex: number
visibleIndex = hoverIndex ?? pinnedIndex
```

- 鼠标移动：更新 `hoverIndex`。
- 点击或触摸：写入 `pinnedIndex`，并让 SVG 获得焦点。
- 指针离开：清除 `hoverIndex`，仍显示 `pinnedIndex`。
- 方向键、Home、End：更新 `keyboardIndex` 和 `pinnedIndex`。
- Escape：清除 `pinnedIndex` 和提示框。
- 调整 viewport 时保留选中的交易日索引。

### Accessibility

- SVG 使用 `role="img"`、`tabIndex=0` 和动态 `aria-label`。
- 选中变化写入 `aria-live="polite"` 的只读区域。
- 提供 `sr-only` 表格，包含日期、收盘价、MA20 和 MA60。
- `:focus-visible` 使用主色描边；键盘状态不依赖 hover。
- 不增加只在悬停时可见的关键信息。

### Theme tokens

图表使用全局图表语义色，并在 Preline 主题层补齐显式的 MA20/MA60 明暗值：

- 浅色：MA20 `#9a4dff`、MA60 `#2f6fe0`
- 深色：MA20 `#e040fb`、MA60 `#4c8dff`

组件只引用 `var(--chart-ma-20)` 与 `var(--chart-ma-60)`，不直接写颜色。

## Alternatives Considered

### ECharts

可复用 axis/tooltip 能力，但需要把当前 120 点简单趋势图升级为更重的 canvas/SVG 实例，键盘逐日语义、隐藏表格和固定选中态仍需额外实现；本次不使用。

### klinecharts

适合真正的 K 线和缩放，但需求明确是收盘价趋势，且引入后与现有轻量 SVG 形成重复图表体系；本次不使用。

### 保留一个固定 viewBox

实现更少代码，但移动端会形成过宽的横向压缩，`MM-DD` 刻度和长提示框可读性不足；本次按确认稿提供两个 viewport。

## Risks / Trade-offs

- [浏览器媒体查询与 SSR] → 使用 `useSyncExternalStore` 订阅 viewport，避免阻塞渲染或 hydration 读取窗口尺寸。
- [120 行隐藏表格增加 DOM 体积] → 数据最多 120 行，只在图表模块内存在，信息价值高于开销。
- [点击固定选中与 pointerleave 冲突] → `visibleIndex` 明确由 hover 优先、固定选中兜底。
- [技术指标与计算均线尾部值不完全一致] → MA 曲线按展示窗口计算；摘要仍展示服务端技术指标值，二者代表同一 MA 口径，不在前端改写服务端指标。
- [移动端悬浮按钮遮挡] → 页脚改为纵向排列，并在移动端保留右侧安全距离。

## Rollback

本次只替换一个前端展示组件和增加纯函数/测试，无数据迁移。若需回滚，仅恢复 `StockAnalysisDetail` 的原内嵌图表和删除新增组件/计算文件即可；API 与数据库无需回滚。

## Review Result

- **评审者:** 用户确认计划 + Native builder 代码证据复核
- **日期:** 2026-11-21
- **结论:** approved
- **阻塞项:** 无
- **批准前修正:** 响应式断点统一为 `640px`；Preline 主题层补充 MA20/MA60 显式浅色与深色 token；确认后端现有 `bars.slice(-120)` 已满足最近 120 个交易日契约。
- **后续验证:** 双主题、指针、键盘以及空态/部分成功态在实施后的 task 5 使用真实页面验证。
