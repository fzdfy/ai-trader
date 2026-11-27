# Spec Delta

## ADDED Requirements

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
