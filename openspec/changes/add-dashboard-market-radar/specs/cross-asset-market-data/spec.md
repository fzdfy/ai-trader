# Spec Delta

## Purpose

为固定 A 股指数、主流 ETF、伦敦金现货和纳斯达克指数提供统一、可追溯、可降级的市场报价与时间序列能力，同时与股票复权和回测数据隔离。

## ADDED Requirements

### Requirement: Cross-asset catalog is fixed and explicit

跨资产行情能力 SHALL 只接受 `000001.SH`、`399006.SZ`、`510300.SH`、`588000.SH`、`159992.SZ`、`XAUUSD` 和 `IXIC` 七个固定资产，并为每个资产声明名称、单位、时区、交易时段及是否具有成交量。

#### Scenario: Supported asset is requested

- **WHEN** 调用方请求七个固定资产之一
- **THEN** 系统 MUST 返回该资产的统一元数据
- **AND** 指数 MUST 使用“点”，A 股 ETF MUST 使用人民币价格，伦敦金 MUST 使用 `USD/oz`

#### Scenario: Unknown asset is requested

- **WHEN** 调用方请求不在 allowlist 中的资产
- **THEN** 系统 MUST 返回参数错误
- **AND** MUST NOT 自动解释为股票、其他 ETF、黄金期货或上海金

### Requirement: Quotes preserve source and freshness

每个跨资产报价 SHALL 返回价格、昨收、涨跌、报价时间、来源、质量和降级原因；伦敦金 SHALL NOT 伪造成交量。

#### Scenario: Primary source succeeds

- **WHEN** 主源返回有效报价
- **THEN** 系统 MUST 使用主源报价并标记 `available`
- **AND** 返回源名称和报价时间

#### Scenario: Primary source fails

- **WHEN** 主源超时或返回无效报价
- **THEN** 系统 MUST 尝试声明过的备源
- **AND** 使用备源时 MUST 返回降级原因

#### Scenario: London gold quote is displayed

- **WHEN** 返回 `XAUUSD` 报价
- **THEN** 成交量 MUST 为 `null`
- **AND** 页面数据契约 MUST 标记该资产没有成交量

### Requirement: Minute history is collected forward-only

系统 SHALL 在支持交易时段内采集 A 股指数、A 股 ETF 和伦敦金的分钟线并幂等写入，保留最近 13 个月；不得把缺失历史分钟补造成真实数据。

#### Scenario: A-share minute data is collected

- **WHEN** 交易日处于 A 股交易时段
- **THEN** 系统 MUST 采集上证、创业板及三个 A 股 ETF 的分钟点
- **AND** 重复采集同一分钟 MUST 覆盖为同一幂等记录

#### Scenario: London gold crosses midnight

- **WHEN** 伦敦金分钟数据跨越自然日
- **THEN** 系统 MUST 使用绝对时间和独立 session date 保留顺序
- **AND** MUST NOT 把午夜后的数据归到错误交易日

#### Scenario: Minute history predates collection

- **WHEN** 查询早于系统开始分钟采集的时间
- **THEN** 系统 MUST 返回缺失状态
- **AND** MUST NOT 合成不存在的分钟点

### Requirement: Daily history supports dashboard ranges

系统 SHALL 保存可用日线历史，以支持 5D、1M 和 YTD 区间；日线来源和单位必须与报价口径一致。

#### Scenario: Historical range is requested

- **WHEN** 查询 5D、1M 或 YTD
- **THEN** 系统 MUST 使用日线生成区间
- **AND** MUST 返回实际数据起止时间和质量

#### Scenario: Historical coverage is insufficient

- **WHEN** 请求区间内日线不足
- **THEN** 系统 MUST 标记低质量或缺失
- **AND** MUST NOT 用前值无限延伸填补时间轴

### Requirement: Cross-asset ingestion is partial-failure tolerant

单个资产采集失败 SHALL NOT 阻止其他资产成功更新，任务结果必须可区分全部成功、部分成功和全部失败。

#### Scenario: One asset source fails

- **WHEN** 配置资产中一个取数失败
- **THEN** 其他资产 MUST 继续写入
- **AND** 任务 MUST 记录失败资产和错误

#### Scenario: Stored value becomes stale

- **WHEN** 当前取数失败但数据库存在最后可信记录
- **THEN** 系统 MAY 返回最后记录用于展示
- **AND** MUST 标记陈旧和最后可信时间

### Requirement: Cross-asset data stays isolated from backtest contracts

跨资产表和查询 SHALL NOT 改写 `bar1d_raw`、复权视图、PIT 表函数或 `load_kline` 输出契约。

#### Scenario: Cross-asset migration is applied

- **WHEN** 新跨资产结构上线
- **THEN** 现有股票 K 线与复权数据 MUST 保持不变
- **AND** 回测读取 MUST 继续使用原有契约
