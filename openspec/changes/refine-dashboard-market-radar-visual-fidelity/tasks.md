# Tasks

## 0. Visual Design Gate

- [x] 0.1 确认 `quant-workbench-dashboard-market-radar-v6.html` 为每日看板视觉基准，并保留 Apollo Quant 品牌、侧栏和页面级导航；证据为 `dashboard-market-radar-v6` 截图目录。
- [x] 0.2 确认页面结构、图表语义、ETF 三行报价、SIGNAL 格式、今日执行摘要、模块级色彩、语义 token、`1440×900` 基准和约 `1500px` 宽屏上限。
- [x] 0.3 初始门禁曾排除“追问 AI”；用户后续明确要求恢复，最终实现以 10.2 为准。不复制 v6 静态数值，不使用示例数据替代真实数据。
- [x] 0.4 用户已同意上述全部视觉决策；差异对照记录在 `/private/tmp/dashboard-ui-detail-review/stitch.png`。

## 1. Dashboard tokens and formatting helpers

- [x] 1.1 在 Preline 主题层增加每日看板模块 wash、信号渐变、soft shadow、圆角和间距语义 token，验证浅色/深色无 raw hex 业务散落。
- [x] 1.2 增加带符号、两位小数的涨跌幅纯 helper，并用单元测试覆盖正数、负数、零和非有限值。

## 2. A-share board fidelity

- [x] 2.1 重构 A 股头部为上证/创业板双报价概览并支持点击切换，验证价格、代码、涨跌、主图和 SIGNAL 同步且各域区间互不影响。
- [x] 2.2 对齐 A 股标题区、质量状态、图例、按钮层级、卡片内边距和 SIGNAL 容器几何，验证正常、加载、缺失、陈旧和键盘状态。

## 3. Shared market chart grammar

- [x] 3.1 扩展 `MarketAssetChart` 支持昨收参考、图例、渐变面积、明显成交量、格式化坐标轴和真实交易刻度，增加坐标轴格式化 helper 并验证 A 股、ETF、伦敦金和纳指的数据边界。
- [x] 3.2 保持十字线、方向键、Home/End、读屏数据点、主题刷新和 reduced motion，验证图表键盘与深色切换测试。

## 4. ETF and cross-market fidelity

- [x] 4.1 将 ETF 卡改为三只 ETF 报价列表加选中走势，验证行选择、ETF 方向键、独立区间和“不进入 A 股 SIGNAL”文案。
- [x] 4.2 对齐跨市场卡 wash、标题、区间、昨收线、无成交量语义和“不进入 A 股信号”状态，验证伦敦金与纳指切换。

## 5. SIGNAL presentation

- [x] 5.1 增加因子分格式化 helper，并按 v6 重排 SIGNAL 标题、置信度、证据和因子胶囊，验证因子分为圆整整数、长浮点不直接显示、缺失和低置信度状态保持布局。
- [x] 5.2 同步选中指数文案与真实置信度来源，验证 ETF 或跨市场变化不改变 SIGNAL。

## 6. Today execution fidelity

- [x] 6.1 增加今日工作流成功率 helper，并为今日工作流增加今日运行、活跃流程和成功率摘要，验证有数据、零数据和单请求失败状态。
- [x] 6.2 统一今日行动与今日工作流的标题、留白、卡片高度、空错状态和重试入口，验证空态不塌缩、移动端单列和任务详情跳转。

## 7. Dashboard composition and states

- [x] 7.1 增加行情日标题 helper，调整每日看板页头、主内容最大宽度、左右栏比例、模块间距和卡片表面，验证 `1440×900` 与宽屏约 `1500px` 内容密度。
- [x] 7.2 对齐主雷达、今日执行和旧模块的加载、空、错误、部分成功与陈旧状态，验证局部状态变化不引起布局跳动。

## 8. Integration and visual verification

- [x] 8.1 使用真实 Docker 数据执行 Web 全量测试、类型检查、lint 和生产构建，记录最新命令与结果。
- [x] 8.2 在真实认证页面完成桌面 `1440×900`、宽屏、移动端 `390×844`、浅色、深色、ETF Tab、图表键盘和降级状态截图，验证无横向溢出、控制台错误、图片失败和左右高度偏差。

## 9. Follow-up source-level parity

- [x] 9.1 按 v6 源码收紧 A 股坐标轴刻度、质量日期和图表 kicker，并补齐 ETF 选中报价层级。
- [x] 9.2 将数据状态与四项 KPI 统一为 v6 的连续面板语法，移除当前属于旧模块的视觉权重。
- [x] 9.3 重排每日选股、资讯增量和最近复盘：选股与资讯并排，复盘独占下行区，保持真实数据和跳转。
- [x] 9.4 重新运行测试、类型检查、lint、构建和桌面/移动端几何检查。

## 10. Cross-asset and chart interaction fixes

- [x] 10.1 统一 A 股、跨市场和 ETF 折线为 `2.1px`，保持 `1px` 网格和昨收虚线，并缩减 A 股图表的横纵刻度密度。
- [x] 10.2 恢复 v6 蓝色 SIGNAL 渐变和黄色“追问 AI”入口，点击后打开真实 AI 研究助手。
- [x] 10.3 固定跨市场卡为 `358px`，确保伦敦金与纳指之间切换及纳指缺失态不改变高度。
- [x] 10.4 按区间格式化 X 轴：`1D` 时间、`5D/1M` 日期、`YTD` 月份，并验证价格与成交量共用刻度。

## Workflow follow-up

- 用户验收实现后再执行代码审查与归档确认。
- 归档必须单独确认。
