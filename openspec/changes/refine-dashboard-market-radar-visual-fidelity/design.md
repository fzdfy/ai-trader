# Design

## Context

每日看板的市场数据、区间查询、ETF Tab、跨市场切换和今日执行能力已经存在；本次只收敛视觉与展示行为。当前生产组件使用正确数据，但与 v6 原型相比缺少双指数概览、完整 ETF 报价列表、昨收参考、图例、明显成交量、今日工作流摘要和统一的卡片质感。

现有前端基于 React、Tailwind CSS v4、Preline 语义 token 与 ECharts；本次继续使用这些能力，不新增图表库或视觉依赖。

## Goals / Non-Goals

**Goals:**

- 在每日看板主内容区实现 v6 的模块结构、信息层级、图表语义、文案和表面质感。
- 继续只使用 Market Brief、Work Task、Workflow Run 的真实数据。
- 让成功、加载、空、错误、部分成功、陈旧和缺失状态保持相同布局几何。
- 在 `1440×900`、约 `1500px` 内容宽度和 `390×844` 三档视口完成视觉验收。

**Non-Goals:**

- 不修改 Apollo Quant 品牌、侧栏、页面级导航、认证和路由。
- 不修改 Quant、Server API、数据库、Worker 或数据源。
- 不复制 v6 原型中的静态行情、84% 置信度或示例任务。
- “追问 AI”入口必须打开现有 AI 研究助手，不使用静态占位按钮。

## Decisions

### Add dashboard-scoped semantic tokens

在 Preline 主题层增加每日看板专用语义 token，例如 A 股 wash、跨市场 wash、ETF wash、信号渐变和 soft shadow。组件引用语义 token，不在业务组件散落 raw hex。

替代方案是直接把 v6 HTML 的十六进制颜色复制进组件；这会破坏深色模式、用户主题切换和现有设计规范，因此不采用。

### Rebuild the A-share header around two selectable quote summaries

A 股主控台头部使用上证指数、创业板指双报价块作为切换入口，显示名称、代码、价格和涨跌幅；当前主图和 SIGNAL 跟随选中指数。范围按钮仍只控制 A 股图。

替代方案是在报价块之外继续保留独立 Tab；两套同义切换会重复操作和视觉噪声，因此不采用。

### Keep ECharts and configure a shared market-chart grammar

三个市场图继续复用现有 ECharts 组件，通过 props 配置：

- 当前价主线、渐变面积、虚线网格、格式化坐标轴和图例。
- `referencePrice` 绘制昨收虚线；伦敦金和纳指无成交量时隐藏成交量网格与柱。
- 十字线、键盘浏览、读屏数据点和 reduced motion 行为保持现有可访问性能力。

替代方案是照搬 v6 的手写 SVG；那会丢失现有多点交互、主题刷新和键盘逻辑，也会形成第二套图表实现。

### Separate real-data formatting from presentation structure

增加纯函数处理展示格式：行情日标题、价格、涨跌幅、因子整数分、数据点日期和今日工作流摘要。API 继续返回完整精度；组件只负责布局和状态。

替代方案是在 JSX 内散落 `toFixed`、日期切片与条件格式化；这会重复且难以测试，因此不采用。

### Restore the full ETF quote list above the selected chart

ETF 卡使用三行报价列表作为选择器，展示全部三个 ETF 的名称、代码、价格和涨跌幅；选中行控制下方独立走势和区间。行选择保持现有键盘方向键语义。

替代方案是只显示当前 ETF 的报价；这会让用户失去横向比较能力，也与确认的 v6 信息结构不一致。

### Preserve Today Execution geometry and add workflow summary

今日行动和今日工作流保持桌面并列、移动端单列。今日工作流在标题下增加今日运行、活跃流程、成功率三项摘要，再展示最近运行或空态。错误和空态继续保留标题、摘要、卡片高度和重试。

替代方案是只展示列表/空态；这无法提供 v6 的当日运行概览，也会让有数据与无数据状态结构不一致。

### Keep the app shell outside visual fidelity scope

视觉基准仅覆盖每日看板主内容区。品牌、侧栏、页面级导航和全局主题入口保持当前 Apollo Quant 工作台。

替代方案是同步还原 v6 的 PULSE/QUANTILE 外壳；这会扩大到全局品牌重构，超出本次看板保真范围。

### Bound wide-screen growth

主内容最大宽度约 `1500px` 并居中。宽屏只增加页面留白；A 股主控台与右侧观察列保持 v6 相对比例。

替代方案是让卡片无限拉宽；这会降低图表可读性和首屏信息密度。

## Risks / Trade-offs

- [Real data produces labels longer than v6 placeholders] → 使用截断、tabular numbers、稳定的价格单位和 tooltip，不复制示例值。
- [ECharts 与原型 SVG 无法像素完全一致] → 以构图、层级、颜色、线型、留白和交互一致性为验收目标，不逐路径复制 SVG。
- [新增双指数概览和 ETF 报价列表增加首屏密度] → 控制在固定高度，并用响应式布局保证窄屏可读。
- [加载/错误状态可能破坏等高] → 为每个模块保留确定的 min-height 和相同网格占位。
- [深色模式出现低对比度] → 使用语义 token，并在浅色、深色截图和浏览器可读性检查中逐项修正。

## Visual Design

- 已确认原型：`docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v6.html`
- 已确认截图：`docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/`
- 对照证据：`/private/tmp/dashboard-ui-detail-review/stitch.png`

实现必须覆盖：

- 成功：双指数概览、A 股趋势与 SIGNAL、跨市场卡、完整 ETF 报价列表、今日执行摘要。
- 加载：主雷达和今日执行使用与最终结构一致的骨架。
- 空与错误：保留卡片、标题、摘要、操作和高度。
- 部分成功、陈旧、缺失：仅替换对应模块内容，不影响其他模块数据边界。
- 桌面 `1440×900`、约 `1500px` 内容宽度、移动端 `390×844`。
- 浅色、深色、键盘焦点、ETF 方向键、图表方向键和 reduced motion。

## Migration Plan

1. 先完成看板视觉 token 和纯格式化 helper。
2. 按 A 股主控台、图表、ETF/跨市场、SIGNAL、今日执行依次替换展示层。
3. 保留现有 `DASHBOARD_MARKET_RADAR_ENABLED` 回退；关闭时继续显示旧每日看板。
4. 执行单测、类型检查、lint、生产构建和真实浏览器视觉验收。

回滚只关闭功能开关，不删除已采数据，不修改数据库。
