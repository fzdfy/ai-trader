# stock-analysis-workbench Specification

## Purpose

为单只 A 股提供可追溯的研究工作台，明确展示事实、统计情景、风险参考区间和 AI 归纳，不输出保证性结论。

## Requirements

### Requirement: Stock analysis is discoverable under market intelligence

个股分析 SHALL 位于“市场情报”导航，并支持从现有行情详情进入。

#### Scenario: User finds a stock analysis
- **WHEN** 用户进入“个股分析”
- **THEN** 系统 MUST 支持按名称或代码搜索 A 股
- **AND** 选择标的后 MUST 打开该股票的个股分析页面

#### Scenario: User starts from market detail
- **WHEN** 用户在现有行情详情页点击“深度分析”
- **THEN** 系统 MUST 打开同一标的的个股分析页面
- **AND** 面包屑和返回链路 MUST 保持可追溯

### Requirement: Stock analysis exposes real data with freshness

个股分析所有模块 SHALL 返回真实数据日期、来源和质量状态。

#### Scenario: Quote is current
- **WHEN** 实时行情可用
- **THEN** 页面 MUST 显示最新价、涨跌幅、PE、PB、市值和行情时间

#### Scenario: Quote is stale
- **WHEN** 实时行情失败或过期
- **THEN** 页面 MUST 标记陈旧并显示最后可用时间
- **AND** MUST NOT 将旧行情描述为实时数据

#### Scenario: Module is unavailable
- **WHEN** 任一数据域缺失或失败
- **THEN** 对应模块 MUST 显示空状态或错误状态
- **AND** 其他可用模块 MUST 继续展示

### Requirement: Forecasts are probabilistic and explainable

系统 SHALL 为 5D、20D、60D 窗口输出概率化价格情景。

#### Scenario: User views a forecast
- **WHEN** 数据量和样本满足最低要求
- **THEN** 系统 MUST 展示 P10/P50/P90 区间、上涨/震荡/下跌概率、样本量、模型版本和置信度

#### Scenario: Forecast sample is insufficient
- **WHEN** 数据量或有效样本不足
- **THEN** 系统 MUST 标记低置信度或停止展示数值
- **AND** MUST NOT 输出确定性目标价

### Requirement: Risk range separates technical, valuation, and scenario evidence

系统 SHALL 使用“风险参考区间”展示技术、估值和情景三类区间。

#### Scenario: User reads risk range
- **WHEN** 三类数据均可用
- **THEN** 页面 MUST 分别展示技术支撑/压力、估值分位和情景区间
- **AND** MUST 说明合成方法

#### Scenario: User reads a generated summary
- **WHEN** AI 归纳股票分析
- **THEN** 每个观点 MUST 引用结构化指标或研报页码
- **AND** AI MUST NOT 自行生成价格预测数字

### Requirement: Stock analysis includes evidence across research domains

页面 SHALL 展示研报、财务估值、资金筹码、新闻公告和数据质量证据。

#### Scenario: User studies fundamentals
- **WHEN** 财务和估值数据可用
- **THEN** 页面 MUST 展示营收、利润、EPS、ROE、估值和历史分位

#### Scenario: User studies funds
- **WHEN** 资金筹码数据可用
- **THEN** 页面 MUST 展示主力资金、筹码区间和相关事件

#### Scenario: User studies reports
- **WHEN** 研报数据可用
- **THEN** 页面 MUST 展示评级、机构、发布日期、EPS 预测和原文引用

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

### Requirement: Stock analysis exposes the complete technical signal matrix

个股分析工作台 SHALL 展示该标的的 10 个基础信号、12 个 K 线形态、10 个高级个股模型和 12 个微观结构信号，共 44 项。

#### Scenario: User opens stock analysis with sufficient daily history

- **WHEN** 用户打开有足够日线历史的个股分析
- **THEN** 页面 MUST 展示四个独立分组的 44 项信号
- **AND** 每项 SHALL 使用稳定 `signal_id`、定义版本和对象代码
- **AND** 页面 MUST 保留现有价格与趋势、风险区间、研报、财务和事件模块

#### Scenario: User switches between stock detail and analysis

- **WHEN** 用户从快速行情详情进入个股分析
- **THEN** 系统 MUST 打开同一标的
- **AND** 同名信号 MUST 使用相同定义版本和窗口

### Requirement: Technical conclusions expose their component evidence

个股分析的 K 线形态和高级模型 SHALL 展示组成它们的基础信号、因子和缺失项，不得只显示结论标签。

#### Scenario: User expands a K-line pattern

- **WHEN** 用户展开“底部起涨”或任一其他形态
- **THEN** 系统 MUST 展示确认条件、失效条件、组成基础信号和业务时间
- **AND** 每个组成项 MUST 链接到同一矩阵中的信号详情

#### Scenario: User expands an advanced model

- **WHEN** 用户展开 Alpha、质量、盈利修正或多因子模型
- **THEN** 系统 MUST 展示实际参与计算的因子、窗口和权重或阈值版本
- **AND** 缺失因子 MUST 明确列出

### Requirement: Microstructure separates observed flow from inference

个股微观结构区域 SHALL 明确区分盘口和成交事实、代理估算及不可用数据。

#### Scenario: Daily OHLCV is the only available input

- **WHEN** 标的仅有日线 OHLCV
- **THEN** 可计算信号 MUST 正常展示
- **AND** 需要逐笔、Level 2 或逐笔委托的信号 MUST 显示 `unavailable`
- **AND** 系统 MUST 列出缺失的数据级别

#### Scenario: Tick data is available only for the latest session

- **WHEN** 只存在最近交易日的聚合逐笔数据
- **THEN** 相关信号 MUST 标记为盘中近似或单日样本
- **AND** MUST NOT 展示为跨日稳定结论

#### Scenario: User reads large trade or absorption evidence

- **WHEN** 页面展示大单、吸收或补单信号
- **THEN** 文案 MUST 使用订单流行为描述
- **AND** MUST NOT 描述为已识别具体机构或真实主力身份

### Requirement: Analysis summary cites structured signals

个股分析的自动摘要 SHALL 引用结构化信号 ID 或现有研报页码，不得生成无证据的技术结论。

#### Scenario: User reads the research summary

- **WHEN** 摘要包含趋势、形态或资金判断
- **THEN** 每个判断 MUST 引用对应信号、指标或研报证据
- **AND** 摘要 MUST NOT 生成未验证胜率或确定性目标价

### Requirement: Signal matrix preserves existing trend semantics

新增信号矩阵 SHALL NOT 改变现有“价格与趋势”对前复权收盘价的标识或图表契约。

#### Scenario: User compares trend and K-line pattern

- **WHEN** 页面同时展示价格趋势和 K 线形态
- **THEN** 价格趋势 MUST 继续明确为前复权收盘价
- **AND** K 线形态 MUST 使用其定义的数据级别和复权口径
- **AND** 页面 MUST NOT 把收盘价折线标注为 K 线
