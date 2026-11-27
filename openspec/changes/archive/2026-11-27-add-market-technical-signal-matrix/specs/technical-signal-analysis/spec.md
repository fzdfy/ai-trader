# Spec Delta

## Purpose

为大盘、板块、个股和黄金提供统一、可追溯的技术信号目录、计算状态、数据质量和验证证据，帮助用户在同一口径下逐层诊断市场并核对结论依据。

## ADDED Requirements

### Requirement: Signal catalog exposes 140 stable definitions

系统 SHALL 暴露 140 个带稳定 ID 和定义版本的信号：大盘、板块、个股和黄金各 10 个基础信号、12 个 K 线形态与 10 个高级模型，另有 12 个个股微观结构信号。

#### Scenario: Client reads the complete catalog

- **WHEN** 客户端读取信号目录
- **THEN** 系统 MUST 返回 140 个唯一 `signal_id`
- **AND** 每个定义 MUST 声明对象、层级、名称和定义版本
- **AND** 数量 MUST 为大盘、板块、个股、黄金各 32 个，个股微观结构 12 个

#### Scenario: Duplicate or missing definition is detected

- **WHEN** 目录中出现重复 ID、未知对象或数量不足
- **THEN** 发布检查 MUST 失败
- **AND** 系统 MUST NOT 以部分目录标记为完整

### Requirement: Basic technical signals use one shared ten-item catalog

基础信号目录 SHALL 包含价格相对 MA200、MA200 斜率、MACD 零轴状态、MACD 背离、RSI 超买超卖与背离、布林带压缩扩张、RVOL、ADX/DI、OBV 和 ATR 波动率状态。

#### Scenario: User views basic signals

- **WHEN** 用户查看任一对象的基础信号
- **THEN** 系统 MUST 展示上述 10 个固定信号
- **AND** 每个基础信号 MUST 展示观测值、判定状态和数据时间
- **AND** 黄金交叉和多头排列 MUST NOT 再次作为基础信号重复计数

### Requirement: K-line patterns use one shared twelve-item catalog

K 线形态目录 SHALL 包含震荡待涨、缩量筑底、黄金交叉、多头排列、底部起涨、平台突破、回踩确认、主升加速、高位滞涨、顶部反转、死亡交叉和空头破位。

#### Scenario: User views K-line patterns

- **WHEN** 用户查看任一对象的 K 线形态
- **THEN** 系统 MUST 展示上述 12 个固定形态
- **AND** 每个形态 MUST 展示形成条件、确认条件、失效条件和组成证据
- **AND** 形态名称 MUST 表示组合后的市场状态，而不是单根蜡烛图

### Requirement: Advanced market models expose ten market-state models

大盘高级模型 SHALL 包含 Risk-On/Risk-Off、利率曲线与估值周期、市场宽度扩散、波动率状态、跨资产相关性、经济周期领先指标、多因子风格扩散、信用周期、市场流动性与成交结构及 HMM 市场状态。

#### Scenario: User views advanced market models

- **WHEN** 用户查看大盘高级模型
- **THEN** 系统 MUST 展示上述 10 个模型
- **AND** 系统 MUST 区分指数技术证据与 A 股整体市场状态证据

### Requirement: Advanced sector models expose ten rotation models

板块高级模型 SHALL 包含成长防守相对强弱、行业动量扩散、板块相对强弱趋势、行业资金流、盈利周期与预期修正、估值分位轮动、产业链景气传导、龙头与板块共振、拥挤度反转及多因子行业配置。

#### Scenario: User views advanced sector models

- **WHEN** 用户查看板块高级模型
- **THEN** 系统 MUST 展示上述 10 个模型
- **AND** 行业与概念板块 MUST 使用各自正确的成分和基准口径

### Requirement: Advanced stock models expose ten selection models

个股高级模型 SHALL 包含 Alpha 动量、Fama-French 多因子、质量成长、盈利预期修正、资金累积与派发、波动率压缩突破、筹码集中度、行业相对强弱、事件驱动和多因子预期收益。

#### Scenario: User views advanced stock models

- **WHEN** 用户查看个股高级模型
- **THEN** 系统 MUST 展示上述 10 个模型
- **AND** 系统 MUST 为每个模型展示实际可用的因子、窗口和缺失项

### Requirement: Advanced gold models expose ten macro and cross-asset models

黄金高级模型 SHALL 包含黄金与实际利率、黄金与美元、金银比、CFTC 持仓拥挤度、黄金 ETF 资金流、央行购金、黄金与大宗商品比价、期货期限结构、期权偏度与隐含波动率及黄金宏观状态切换。

#### Scenario: User views advanced gold models

- **WHEN** 用户查看黄金高级模型
- **THEN** 系统 MUST 展示上述 10 个模型
- **AND** 未接入的宏观或持仓数据 MUST 返回明确的数据要求和缺失状态

### Requirement: Stock microstructure exposes twelve signals

个股微观结构目录 SHALL 包含 OFI、CVD、VPIN、Kyle Lambda、OBI、主动成交吸收、大单主动交易失衡、Amihud、Volume Profile、盘口补单与撤单、集合竞价失衡和 VWAP 偏离。

#### Scenario: User views stock microstructure

- **WHEN** 用户查看个股微观结构
- **THEN** 系统 MUST 展示上述 12 个信号
- **AND** 每个信号 MUST 声明所需数据级别和历史可用范围
- **AND** 系统 MUST NOT 把订单流行为描述为具体机构身份

### Requirement: Signal results carry definition evidence and dual timestamps

每次信号结果 SHALL 提供定义版本、适用对象、状态、观测值、公式或规则摘要、参数、确认条件、失效条件、业务时间、计算时间、来源和数据质量。

#### Scenario: User expands a signal

- **WHEN** 用户展开任一信号
- **THEN** 系统 MUST 展示定义版本、业务时间、计算时间、来源和质量状态
- **AND** 系统 MUST 展示该信号的确认与失效条件
- **AND** 系统 MUST 使用信号对应的真实历史窗口

#### Scenario: Definition changes after a snapshot

- **WHEN** 信号定义版本与历史快照版本不同
- **THEN** 系统 MUST 显示快照使用的版本
- **AND** 系统 MUST NOT 用新规则静默重算并冒充旧快照

### Requirement: Signal statuses represent evidence availability

信号状态 SHALL 使用 `triggered`、`neutral`、`invalidated`、`low-confidence`、`unavailable` 和 `not-applicable` 表达结果，不得用布尔缺失值替代。

#### Scenario: Required data is unavailable

- **WHEN** 信号所需数据缺失或未接入
- **THEN** 系统 MUST 返回 `unavailable`
- **AND** 系统 MUST 说明缺失数据与影响
- **AND** 系统 MUST NOT 返回 `neutral`、零值或伪触发

#### Scenario: Asset does not support the signal

- **WHEN** 资产特性不支持信号条件
- **THEN** 系统 MUST 返回 `not-applicable`
- **AND** XAU/USD 无可信成交量时，RVOL 和 OBV MUST 为 `not-applicable`

#### Scenario: Sample size is insufficient

- **WHEN** 历史窗口或横截面样本不足
- **THEN** 系统 MUST 返回 `low-confidence` 或 `unavailable`
- **AND** 系统 MUST 保留样本数量

### Requirement: Signal snapshots are reproducible by version and cutoff

系统 SHALL 以标的对象、信号定义版本、业务截止日和计算截止时间标识信号快照，并保证相同输入与版本产生相同结果。

#### Scenario: Worker retries the same snapshot

- **WHEN** 同一对象、定义版本和业务截止日的快照被重复计算
- **THEN** 系统 MUST 幂等写入或返回既有结果
- **AND** 不得生成重复业务快照

#### Scenario: Historical signal is queried

- **WHEN** 用户查询历史信号
- **THEN** 系统 MUST 使用该快照记录的定义版本与业务时间
- **AND** 系统 MUST NOT 使用晚于业务截止日的数据

### Requirement: Signal validation evidence is separate from live state

系统 SHALL 将实时触发状态与统一回测验证结果分开存储和展示。

#### Scenario: Signal has no validation evidence

- **WHEN** 信号尚未完成统一成本、持有期和样本外验证
- **THEN** 页面 MUST 显示“待验证”
- **AND** 系统 MUST NOT 展示胜率、高胜率或期望收益

#### Scenario: Signal has validation evidence

- **WHEN** 信号具备有效验证结果
- **THEN** 系统 MUST 展示 5/20/60 日窗口、样本量、胜率、盈亏比、期望收益、最大回撤和验证版本
- **AND** 系统 MUST 说明验证使用的对象范围和时间范围

### Requirement: Signal failures are isolated by object and data domain

单个信号、对象或数据域失败 SHALL NOT 清空其他已成功信号。

#### Scenario: One advanced model fails

- **WHEN** 某个高级模型计算失败
- **THEN** 该模型 MUST 显示错误或不可用状态
- **AND** 同对象其他信号 MUST 继续展示
- **AND** 用户 MUST 能单独重试该数据域

### Requirement: Layered judgments are deterministic and versioned

每个技术信号对象 SHALL 具有一个版本化判断摘要，包含对象总判断以及基础信号、K 线形态和高级模型的独立判断；个股还 SHALL 包含仅调整置信度的微观结构辅助判断。

#### Scenario: Object summary is generated from core layers

- **WHEN** 系统完成一个对象的技术信号计算
- **THEN** 系统 MUST 由基础信号、K 线形态和高级模型三个核心层形成对象总判断
- **AND** 判断 MUST 使用确定性服务端规则，不得调用 Agent 决定方向
- **AND** 摘要 MUST 包含 `summaryVersion`、总判断、各层判断、方向计数、证据覆盖率和关键说明
- **AND** 判断结果 MUST 随快照持久化，并在后续读取时原样返回

#### Scenario: Evidence availability changes direction voting

- **WHEN** 某层包含 `low-confidence`、`unavailable` 或 `not-applicable` 信号
- **THEN** 这些信号 MUST NOT 计入方向票数
- **AND** 缺失数据 MUST NOT 被改写为 `neutral` 或零值
- **AND** 层判断 MUST 说明低置信和不可用证据对覆盖率或置信度的影响

#### Scenario: Stock microstructure is auxiliary

- **WHEN** 个股微观结构证据与三个核心层结论冲突
- **THEN** 微观结构 MUST NOT 改写对象总判断方向
- **AND** 微观结构 MAY 根据其证据质量下调总判断置信度

#### Scenario: No valid directional evidence exists

- **WHEN** 核心层没有可参与方向投票的有效证据
- **THEN** 对象总判断 MUST 为“证据不足”或“中性”
- **AND** MUST NOT 生成偏多或偏空结论
