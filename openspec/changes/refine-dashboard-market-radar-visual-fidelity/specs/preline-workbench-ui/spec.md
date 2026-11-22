# Spec Delta

## ADDED Requirements

### Requirement: Dashboard follows the confirmed v6 visual baseline

每日看板主内容 SHALL 以已确认的 v6 原型作为视觉基线；品牌、侧栏和页面级导航 SHALL 保持当前工作台样式。

#### Scenario: User opens the daily dashboard

- **WHEN** 用户进入 `/home`
- **THEN** 每日看板主内容 MUST 保持 A 股主控台在左、跨市场背景和主流 ETF 在右的桌面结构
- **AND** 页面 MUST NOT 因视觉还原修改 Apollo Quant 品牌、侧栏或页面级导航

#### Scenario: User compares surfaces

- **WHEN** 用户查看每日看板卡片
- **THEN** 卡片 MUST 使用统一的语义表面、细边框、轻阴影、较大圆角和稳定内边距
- **AND** 浅色和深色模式 MUST 使用对应语义 token，不得写死浅色坐标

### Requirement: A-share overview and charts expose v6 market context

A 股主控台 SHALL 展示上证指数与创业板指的报价概览，并使用带昨收参考、图例和成交量的市场趋势图。

#### Scenario: User switches the A-share index

- **WHEN** 用户选择上证指数或创业板指
- **THEN** 双指数报价概览、当前价格、涨跌幅、走势和 SIGNAL 输入 MUST 同步切换到该指数
- **AND** 指数切换 MUST NOT 改变 ETF 或跨市场卡片的独立区间

#### Scenario: User reads an A-share chart

- **WHEN** A 股趋势图有足够数据
- **THEN** 图表 MUST 显示价格走势、可用成交量、昨收参考、图例和真实交易时段刻度
- **AND** 图表 MUST 在键盘焦点下提供可读的当前数据点信息

### Requirement: ETF and cross-market domains remain visibly independent

主流 ETF 和跨市场 SHALL 使用独立观察卡，并以真实报价和独立区间表达其不参与 A 股 SIGNAL。

#### Scenario: User views the ETF card

- **WHEN** ETF 卡有可用报价
- **THEN** 三个主流 ETF 的报价 MUST 同时可见
- **AND** 用户 MUST 能选择任一 ETF 查看其独立走势和区间
- **AND** ETF 卡片 MUST 明确说明其不进入 A 股 SIGNAL

#### Scenario: User views the cross-market card

- **WHEN** 用户查看伦敦金或纳指
- **THEN** 跨市场卡 MUST 使用独立走势和区间
- **AND** 伦敦金 MUST 显示 `USD/oz` 且隐藏成交量
- **AND** 卡片 MUST 明确说明其仅作背景、不进入 A 股 SIGNAL

### Requirement: Dashboard presents real values with stable readable formatting

每日看板 SHALL 使用真实 API 数据，并将高精度数值转换为稳定、可扫描的界面格式。

#### Scenario: User reads market signal factors

- **WHEN** SIGNAL 因子具有数值
- **THEN** UI MUST 显示圆整后的可读分值，不得暴露长浮点尾数
- **AND** 数据置信度 MUST 来自真实报价、覆盖率和输入完整度
- **AND** UI MUST NOT 复制原型中的静态示例数值

#### Scenario: Market date differs from calendar date

- **WHEN** 最近行情交易日早于当前自然日
- **THEN** 页头主日期和快照状态 MUST 使用最近行情交易日语义
- **AND** UI MUST NOT 把旧行情描述为当前自然日实时行情

### Requirement: Today execution preserves v6 structure in every state

今日行动与今日工作流 SHALL 保持并列执行区结构，并在加载、空、错误和有数据时维持稳定阅读顺序。

#### Scenario: User has no today activity

- **WHEN** 今日没有 Work Task 或 Workflow Run
- **THEN** 两个模块 MUST 保留原有卡片高度、标题、摘要和空态
- **AND** 今日工作流 MUST 显示真实的今日运行数、活跃流程数和成功率

#### Scenario: A today execution request fails

- **WHEN** 今日行动或今日工作流单独加载失败
- **THEN** 对应模块 MUST 显示错误和重试
- **AND** 其他模块与市场数据 MUST 继续显示

### Requirement: Dashboard fidelity holds across viewports

每日看板 SHALL 在约定的桌面、宽屏和移动视口保持 v6 的阅读密度与模块顺序。

#### Scenario: User opens a wide desktop

- **WHEN** 视口宽于 `1440px`
- **THEN** 主内容 MUST 居中扩展至约 `1500px`
- **AND** A 股与右侧观察列 MUST 保持稳定比例，不得把卡片无上限拉宽

#### Scenario: User opens mobile

- **WHEN** 视口为 `390×844`
- **THEN** A 股主控台、跨市场、主流 ETF 和今日执行 MUST 单列呈现
- **AND** 页面 MUST NOT 出现横向溢出、文字截断或缺失主要操作

#### Scenario: Data is loading, missing or stale

- **WHEN** 对应数据处于加载、缺失或陈旧状态
- **THEN** 模块 MUST 保持正常布局尺寸并显示明确状态
- **AND** 页面 MUST NOT 因局部状态变化而跳动或改变其他模块的数据边界
