# Proposal

## Why

个股分析页的“价格与趋势”当前标注为“K 线”，实际只绘制收盘价折线，且纵轴范围受开高低价影响、横轴仅显示首尾日期，用户无法准确判断指标叠加关系和交易日间隔。需要在不改变后端行情契约的前提下，把该模块修正为口径明确、可交互、可访问的前复权收盘价趋势图。

## What Changes

- 将图表名称和标签修正为“前复权收盘价趋势”，明确展示最近 120 个交易日，不再称为 K 线。
- 叠加 MA20、MA60 以及 20 日支撑、60 日压力参考线；纵轴覆盖收盘价、均线和参考线。
- 横轴按交易日索引等距布局，显示 5 个 `MM-DD` 刻度并让首尾刻度与绘图区边缘对齐。
- 增加十字线、数据提示框、键盘逐日浏览、屏幕阅读器读数与隐藏数据表。
- 明确加载、历史数据不足、根数据错误等状态，桌面与移动端分别采用确认稿的绘图尺寸和底部安全间距。
- 将图表布局、刻度和均线计算拆为可单测的纯函数，并以独立 React 组件承载展示与交互。
- 保持行情 API、数据库、复权口径和数据源取值链路不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `stock-analysis-workbench`: 将价格趋势模块的展示口径、指标叠加、横轴刻度、交互、可访问性和空数据处理明确为可验证行为。

## Visual Design Impact

Visual design: required.

- 受影响页面：个股分析详情页的“价格与趋势”模块。
- 受影响交互与状态：默认趋势、MA/参考线、悬停或点击选中、键盘逐日浏览、历史数据不足、根数据加载与错误。
- 设计稿：`docs/design/prototypes/explorations/quant-workbench-stock-chart-v2.html`。
- 截图证据：`docs/design/prototypes/explorations/screenshots/stock-chart-v2/final-v3-*`。
- 用户已于 2026-11-21 确认设计。
- 生产代码必须继续使用项目既有 Preline/Tailwind 语义变量和 React 组件边界，不直接搬运原型脚本。

## Impact

- 前端：`StockAnalysisDetail` 的价格趋势区域、独立图表组件、纯计算函数及其 Node 测试。
- 交互与可访问性：鼠标、触控、键盘和屏幕阅读器共用同一选中数据模型。
- API、数据库、Quant、鉴权和第三方数据源：无变化。
- 依赖：不新增图表或组件库依赖。
