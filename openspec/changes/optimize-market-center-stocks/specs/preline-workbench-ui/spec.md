# Spec Delta

## ADDED Requirements

### Requirement: Quick quote detail uses a fixed white data canvas

快速行情详情 SHALL 将 K 线主图、成交量、MACD、坐标轴、图表外围和资金结构放入同一白色数据画布；该白色画布是全局明暗主题切换的显式例外。

#### Scenario: User reads the desktop chart and capital structure

- **WHEN** 用户在桌面端打开快速行情详情
- **THEN** K 线主图、指标副图、坐标轴和资金结构 MUST 处于连续的白色数据画布
- **AND** 资金结构 MUST 位于 K 线之后

#### Scenario: User reads the detail on mobile

- **WHEN** 视口宽度为移动端范围
- **THEN** K 线画布和资金结构 MUST 保持白色背景
- **AND** 页面 MUST NOT 产生横向溢出
- **AND** 用户 MUST 能完整阅读图表和资金结构内容

#### Scenario: User opens quick quote detail in dark theme

- **WHEN** 用户处于深色主题并打开快速行情详情
- **THEN** 数据画布 MUST 保持白色
- **AND** 图表文字、网格、坐标轴和资金结构 MUST 在白色背景上保持可读对比度
- **AND** 页面导航、周期切换和操作按钮 MUST 继续遵循深色主题

#### Scenario: Chart or capital data is not available

- **WHEN** K 线或资金结构处于加载、空或错误状态
- **THEN** 白色数据画布 MUST 保持稳定，不得退回主题背景
- **AND** 对应状态 MUST 在白色画布中清晰展示
- **AND** 其他已成功区域 MUST 继续显示

### Requirement: Stock-list pagination preserves accessible context

个股列表的分页控件 SHALL 使用 Preline 语义样式和可访问导航，清楚表达当前页、结果范围与前后页关系。

#### Scenario: User reviews pagination visually

- **WHEN** 个股列表存在多个结果页
- **THEN** 分页 MUST 显示范围、总数、当前页、上一页、下一页和可跳转页码
- **AND** 当前页 MUST 具有可见选中状态和可访问的当前页语义

#### Scenario: User reviews the stock search control

- **WHEN** 用户查看全市场或自选股票搜索框
- **THEN** 图标、输入框和搜索按钮 MUST 位于一个连续的灰蓝搜索整壳内
- **AND** 输入框 MUST NOT 显示原生边框、描边或嵌套白色输入块
- **AND** 搜索框在浅色、深色、桌面和移动端 MUST 使用相同层级结构

#### Scenario: User navigates pagination with keyboard

- **WHEN** 用户使用键盘聚焦并操作分页控件
- **THEN** 所有可用分页按钮 MUST 具有可见焦点
- **AND** Enter 或 Space MUST 触发对应翻页
- **AND** 不可用的上一页或下一页 MUST 保持明确禁用状态

#### Scenario: User returns to a paginated stock list

- **WHEN** 用户从快速行情详情点击返回且来源为个股列表
- **THEN** 页面 MUST 回到进入详情前的 `tab`、`page` 和 `q`
- **AND** 分页 MUST 保持与返回前相同的当前页和结果范围

#### Scenario: Pagination renders on mobile

- **WHEN** 个股列表在移动端显示分页
- **THEN** 分页控件 MUST 换行或收缩到可用宽度
- **AND** 页面 MUST NOT 出现横向溢出
- **AND** 当前范围与当前页 MUST 保持可读
