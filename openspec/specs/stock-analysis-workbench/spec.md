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
