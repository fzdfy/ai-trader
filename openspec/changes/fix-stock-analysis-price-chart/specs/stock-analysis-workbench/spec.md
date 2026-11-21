# Spec Delta

## ADDED Requirements

### Requirement: Price trend identifies its adjustment and price basis

个股分析的价格趋势模块 SHALL 明确表示为前复权收盘价趋势，并 SHALL NOT 把仅连接收盘价的折线标注为 K 线。

#### Scenario: User reads the chart identity

- **WHEN** 价格数据至少包含两个交易日
- **THEN** 模块 MUST 显示“价格与趋势”标题
- **AND** MUST 显示“前复权收盘价 · 最近 N 个交易日”
- **AND** MUST 使用“收盘价”标签而不是“K 线”标签

#### Scenario: Historical prices are insufficient

- **WHEN** 可用价格数据少于两个交易日
- **THEN** 模块 MUST 显示“历史行情不足”空状态
- **AND** MUST NOT 绘制具有误导性的趋势线或虚构坐标

### Requirement: Trend overlays share one visible price scale

价格趋势图 SHALL 在同一纵轴尺度内展示收盘价、MA20、MA60、20 日支撑和 60 日压力；缺少技术指标时 SHALL 保留收盘价趋势并省略不可用叠加。

#### Scenario: Technical context is available

- **WHEN** 收盘价至少包含两个交易日且技术指标可用
- **THEN** 图表 MUST 显示收盘价、MA20、MA60、20 日支撑和 60 日压力
- **AND** 纵轴范围 MUST 覆盖所有可见序列
- **AND** 图例 MUST 对应相同颜色和线型

#### Scenario: Technical context is unavailable

- **WHEN** 技术指标为空
- **THEN** 图表 MUST 继续展示收盘价趋势
- **AND** MUST NOT 绘制 MA 或支撑压力线
- **AND** 模块 MUST 表明技术指标待生成

### Requirement: Trend x-axis follows trading-day order

价格趋势图 SHALL 按交易日索引等距排列数据点，并 SHALL 使用五个与绘图区对齐的 `MM-DD` 横轴刻度；完整日期 SHALL 在选中数据中提供。

#### Scenario: User reads the x-axis

- **WHEN** 图表显示一组交易日
- **THEN** 横轴 MUST 显示五个按交易日索引等距分布的 `MM-DD` 刻度
- **AND** 首尾刻度 MUST 与绘图区左右边界对齐
- **AND** 周末和休市日 MUST NOT 产生额外横向间隔

#### Scenario: User inspects a date

- **WHEN** 用户选中任一交易日
- **THEN** 数据提示 MUST 显示完整 `YYYY-MM-DD` 日期
- **AND** MUST 显示对应收盘价、MA20 和 MA60；不可用指标显示“—”

### Requirement: Trend data is inspectable with pointer and keyboard

价格趋势图 SHALL 提供鼠标、触控和键盘数据浏览，并 SHALL 让视觉选中态与屏幕阅读器读数保持同步。

#### Scenario: Pointer user inspects a point

- **WHEN** 用户在图表绘图区移动或点击
- **THEN** 图表 MUST 显示对应交易日的十字线和数据提示
- **AND** 点击产生的选中态 MUST 在取景或焦点移动后继续保留，直到用户按 Escape 或选择其他日期

#### Scenario: Keyboard user inspects points

- **WHEN** 图表获得焦点
- **THEN** 左右方向键 MUST 逐交易日移动选中点
- **AND** Home 与 End MUST 分别选中首日和末日
- **AND** Escape MUST 清除选中态
- **AND** 图表 MUST 提供可见焦点样式和实时屏幕阅读器读数

### Requirement: Trend chart remains usable across themes and viewports

价格趋势图 SHALL 在桌面和移动端、浅色和深色主题下保持可读，并 SHALL 避免横轴刻度、图例、日期和全局悬浮操作互相遮挡。

#### Scenario: User views the chart on mobile

- **WHEN** 视口宽度为移动端尺寸
- **THEN** 图表 MUST 使用适配移动端的绘图比例
- **AND** 横轴与图例 MUST 无重叠或裁切
- **AND** 页脚日期 MUST 不被右下角悬浮助手按钮遮挡

#### Scenario: User switches theme

- **WHEN** 页面在浅色和深色主题间切换
- **THEN** 轴线、刻度、网格、提示框和所有数据序列 MUST 保持可辨识度
- **AND** MUST 使用项目语义颜色变量
