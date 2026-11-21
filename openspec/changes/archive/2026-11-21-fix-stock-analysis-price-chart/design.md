# Design

完整技术设计见 `docs/superpowers/specs/2026-11-21-stock-analysis-price-chart-design.md`。

## Context

当前 `StockAnalysisDetail.tsx` 内嵌的 SVG 只绘制收盘价，却标注为“K 线”，纵轴受开高低价影响且没有可见横轴。现有 API 已返回最近交易日的前复权 OHLC 数据和技术指标，本次只调整展示与交互边界。

## Goals / Non-Goals

**Goals:**

- 以确认稿呈现前复权收盘价趋势、MA20/MA60、支撑压力、五个交易日刻度。
- 用纯函数锁定均线、坐标和刻度计算，用独立 React 组件锁定交互与可访问性。
- 保持轻量 SVG，不新增依赖。

**Non-Goals:**

- 不实现蜡烛 K 线、成交量副图、缩放平移或新 API。
- 不修改后端技术指标算法、复权、数据库或数据源。

## Visual Design

- 原型：`docs/design/prototypes/explorations/quant-workbench-stock-chart-v2.html`
- 截图：`docs/design/prototypes/explorations/screenshots/stock-chart-v2/final-v3-*`
- 用户已于 2026-11-21 确认。
- 成功态展示全部序列；部分成功只展示收盘价并标明“技术指标待生成”；空态使用现有 `EmptyState`；页面加载和错误继续使用既有骨架/错误卡片。
- 桌面与移动端、浅色与深色、键盘焦点和选中态均按确认稿验收。

## Decisions

### Use a focused SVG component and pure geometry module

保留当前无依赖 SVG，把计算和展示拆开，便于用 Node test 覆盖均线、刻度、坐标和提示框边界。替代方案 ECharts/klinecharts 会增加包体和第二套图表体系，且仍不能自动满足键盘逐日与隐藏数据表要求。

### Derive MA curves from the displayed close window

MA20/MA60 由图表展示的收盘价序列计算，参考线使用服务端 `technical.support20` / `resistance60`。技术指标为空时隐藏全部叠加，但不隐藏收盘价。

### Use trading-day index coordinates

所有数据点使用索引线性映射；横轴取五个约等距索引并格式化为 `MM-DD`。完整日期只放在提示框与可访问读本中，避免移动端横轴拥挤。

### Share one selection model across pointer and keyboard

悬停索引、固定选中索引和键盘索引共同决定一个可见交易日；点击固定、指针离开回退固定值、Escape 清除。SVG 焦点击中时显示数据；`aria-live` 与隐藏表格提供等效读本。响应式断点固定为确认原型使用的 `640px`。

### Respect semantic theme tokens

收盘价、MA20、MA60、支撑、压力、网格和坐标文本全部使用既有图表 CSS 变量，不在组件散落十六进制颜色。Preline 主题层补齐显式的 MA20/MA60 浅色和深色 token，避免 `light-dark()` 在 `.dark` 下缺少 `color-scheme` 时停留在浅色值。

## Failure Modes

- 少于两个交易日：显示空态，不画误导性坐标。
- 技术指标缺失：保留收盘价和横轴，隐藏 MA/参考线，并说明指标待生成。
- 价格端点加载失败：由页面现有错误卡片处理，不渲染空图表。
- 移动端提示框接近边缘：横向位置限制在绘图区内。
- 全局悬浮助手占用右下角：移动端页脚纵向排列并预留右侧安全距离。

## Migration Plan

1. 先创建并测试纯计算契约。
2. 再实现图表组件和页面接入。
3. 执行 Node 测试、类型检查、lint、生产构建和桌面/移动端真实浏览器检查。
4. 若需回滚，恢复页面原内嵌图表即可；无 API 或数据库迁移。

## Risks / Trade-offs

- [隐藏表格增加 DOM 节点] → 最多 120 行，且显著提升屏幕阅读器可用性。
- [双 viewport 增加分支] → 通过 `useSyncExternalStore` 与纯几何函数集中管理，不在渲染树散落尺寸判断。
- [前端 MA 与服务端技术快照尾部值差异] → 图形按窗口计算并保持同口径，摘要继续展示服务端快照值。

## Open Questions

无。

## Review Result

- **Reviewer:** 用户确认计划 + Native builder 代码证据复核
- **Date:** 2026-11-21
- **Result:** approved
- **Blocking items:** 无
- **Resolved before approval:**
  - 现有聚合 API 已在 `apps/server/src/api/stock-analysis.ts` 中执行 `bars.slice(-120)`，无需新增接口或改数据口径。
  - 响应式断点统一为确认稿使用的 `640px`。
  - Preline 主题层补齐 MA20/MA60 显式浅色与深色 token，避免深色主题继承浅色均线色。
  - 纯计算、SVG 展示与页面接入分为三个边界，测试与回滚路径明确。
- **Non-blocking follow-ups:** 已登录生产页面的双主题、指针、键盘和空/部分成功状态留到 task 5 验证。
