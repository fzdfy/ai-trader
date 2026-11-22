# Spec Delta

## Purpose

为每日看板提供统一跨资产行情首屏、可解释的 A 股市场信号和当前用户今日行动，同时保留既有研究模块。

## ADDED Requirements

### Requirement: Dashboard shows fixed market snapshots

每日看板 SHALL 在首屏展示上证指数、创业板指、沪深300ETF、科创50ETF、创新药ETF、伦敦金现货和纳斯达克综合指数的价格、涨跌、单位和数据状态。

#### Scenario: All configured quotes are available

- **WHEN** 所有配置资产都有有效报价
- **THEN** A 股主控台和跨市场背景卡 MUST 同时显示各自资产
- **AND** 指数和 ETF MUST 使用 A 股交易口径，伦敦金 MUST 显示 `USD/oz`，纳指 MUST 显示指数点

#### Scenario: One quote is unavailable

- **WHEN** 单个资产报价缺失
- **THEN** 该 ticker MUST 显示暂不可用或陈旧状态
- **AND** 其他资产 MUST 继续展示

### Requirement: A-share and cross-asset charts are visually separated

A 股主控台 SHALL 只包含上证指数和创业板指切换，并承载 A 股风险信号；伦敦金 SHALL 使用独立的跨资产背景卡和独立区间，不与 A 股信号共用主图。

#### Scenario: A-share index is selected

- **WHEN** 用户在上证与创业板之间切换
- **THEN** A 股主控台 MUST 更新对应指数走势
- **AND** 1D 横轴 MUST 使用 A 股真实交易时段
- **AND** 页面 MUST 显示可用成交量

#### Scenario: London gold context is displayed

- **WHEN** 页面展示伦敦金
- **THEN** 伦敦金 MUST 位于独立跨资产背景卡
- **AND** 横轴 MUST 使用伦敦金连续交易时段
- **AND** 页面 MUST 隐藏成交量序列
- **AND** 单位 MUST 显示 USD/oz
- **AND** 页面 MUST 明确其不进入 A 股信号

#### Scenario: Long range is selected

- **WHEN** 用户为 A 股或伦敦金选择 5D、1M 或 YTD
- **THEN** 对应图表 MUST 按交易日或真实连续时间展示日线
- **AND** MUST NOT 用日历空档制造横向断点

### Requirement: Market signal is deterministic and evidence-backed

市场信号 SHALL 只使用 A 股趋势、广度和热度规则计算，不得由 LLM 自由生成分值或方向。

#### Scenario: Core evidence is sufficient

- **WHEN** 趋势、广度和热度输入满足最低完整度
- **THEN** 系统 MUST 返回风险偏好、中性或风险规避状态
- **AND** MUST 返回各因子分值、证据、模型版本和生成时间

#### Scenario: Core evidence is insufficient

- **WHEN** 两个及以上核心因子缺失或数据置信度低于 40
- **THEN** 市场信号 MUST 标记缺失
- **AND** 状态 MUST 为中性
- **AND** 文案 MUST 说明证据不足

#### Scenario: London gold is available

- **WHEN** 伦敦金报价可用
- **THEN** 信号卡片 MAY 显示其涨跌作为跨资产背景
- **AND** 伦敦金 MUST NOT 改变 A 股趋势、广度和热度分数

#### Scenario: User asks AI about the signal

- **WHEN** 用户从 A 股 SIGNAL 点击“追问 AI”
- **THEN** 页面 MUST 打开现有量化助手
- **AND** 助手 MUST 带入当前 A 股信号和所选标的上下文
- **AND** 助手 MUST NOT 自动执行交易或修改任务

### Requirement: Data confidence excludes prediction accuracy

数据置信度 SHALL 只表达 A 股报价新鲜度、A 股图完整度和 A 股信号输入完整度；伦敦金数据质量不得进入该分数。

#### Scenario: User reads data confidence

- **WHEN** 数据置信度被展示
- **THEN** UI MUST 标识其为数据质量含义
- **AND** MUST NOT 使用“上涨概率”“模型胜率”或同类文案

### Requirement: Today actions use current user Work Tasks

每日看板的今日行动 SHALL 读取当前登录用户今日 Work Task，不得混入 Workflow Run。

#### Scenario: User has tasks today

- **WHEN** 当前用户有今日任务
- **THEN** 页面 MUST 按到期时间显示最多三个任务
- **AND** 点击任务 MUST 进入对应任务详情

#### Scenario: User has no tasks

- **WHEN** 当前用户今日没有任务
- **THEN** 页面 MUST 显示任务空态
- **AND** MUST NOT 用系统流程或静态示例代替

### Requirement: Existing dashboard modules remain available

新首屏 SHALL NOT 删除现有市场主线、市场温度、每日选股、工作流、资讯和复盘；这些模块 MUST 在新首屏之后继续可访问。

#### Scenario: User scrolls below the first screen

- **WHEN** 用户浏览每日看板首屏以下
- **THEN** 现有研究模块 MUST 继续显示
- **AND** 模块状态与数据时间 MUST 保持可追溯

### Requirement: Dashboard states work across themes and viewports

新首屏 SHALL 在桌面与移动端、浅色与深色下可读，并为加载、空、错误和陈旧状态提供明确反馈。

#### Scenario: Mobile user opens dashboard

- **WHEN** 视口为移动端
- **THEN** A 股主控台、A 股信号、黄金背景卡和今日任务 MUST 单列可读
- **AND** 控件 MUST 可键盘或触控操作

#### Scenario: Market Brief request fails

- **WHEN** 首屏聚合请求失败
- **THEN** 页面 MUST 显示错误和重试
- **AND** MUST NOT 使用截图或静态假数据顶替
