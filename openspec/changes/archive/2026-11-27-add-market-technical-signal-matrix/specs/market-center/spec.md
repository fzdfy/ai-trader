# Spec Delta

## ADDED Requirements

### Requirement: Market overview summarizes the A-share technical state

行情中心总览 SHALL 在保留主要指数、市场温度和大类资产轮动的现有职责上，增加 A 股市场状态信号摘要。

#### Scenario: User opens market overview

- **WHEN** 用户进入 `/home/market`
- **THEN** 系统 MUST 展示大盘基础信号、K 线形态和高级模型的关键触发摘要
- **AND** 摘要 MUST 显示业务日期、定义版本和完整度状态
- **AND** 用户 MUST 能展开查看该对象的完整信号矩阵
- **AND** 摘要 MUST NOT 复制每日看板的今日任务、资讯或复盘

#### Scenario: Market signal data is partially available

- **WHEN** 部分大盘信号可用而宏观或跨资产信号缺失
- **THEN** 总览 MUST 展示可触发信号
- **AND** MUST 明确显示缺失信号数量或数据域
- **AND** MUST NOT 把部分成功标记为完整

### Requirement: Boards expose signal summaries and full detail

板块工作区 SHALL 在现有排行、热力图、轮动和异动基础上展示板块信号摘要；板块详情 SHALL 展示该板块的完整 32 项信号矩阵。

#### Scenario: User scans industry or concept boards

- **WHEN** 用户查看行业或概念板块列表
- **THEN** 系统 MUST 展示可用于发现的可排序信号摘要
- **AND** 用户 MUST 能进入对应板块详情
- **AND** 列表 MUST NOT 展开 32 项完整矩阵

#### Scenario: User opens board detail

- **WHEN** 用户打开有有效板块数据的详情页
- **THEN** 页面 MUST 展示 10 个基础信号、12 个形态和 10 个高级模型
- **AND** 每个形态 MUST 可展开组成证据
- **AND** 页面 MUST 保留现有板块行情、资金、轮动和成分股内容

#### Scenario: Board data is unavailable

- **WHEN** 板块历史、资金或成分数据缺失
- **THEN** 依赖缺失数据的信号 MUST 显示 `unavailable` 或 `low-confidence`
- **AND** 其他可用信号 MUST 继续展示

### Requirement: Stock list exposes discovery signals and quick detail exposes a compact matrix

行情中心个股列表 SHALL 展示少量可排序的发现型信号；快速行情详情 SHALL 展示当前标的的技术结论与进入个股分析完整矩阵的入口。

#### Scenario: User scans the stock list

- **WHEN** 用户浏览全市场或自选股票
- **THEN** 系统 MUST 展示少量可排序信号摘要
- **AND** 每个摘要 MUST 链接到同一 `signal_id` 的详情
- **AND** 列表 MUST NOT 展示全部 44 项个股信号

#### Scenario: User opens quick quote detail

- **WHEN** 用户进入 `/home/market/stock/$symbol`
- **THEN** 页面 MUST 在现有行情摘要、K 线和资金结构之外展示可用技术标签
- **AND** 页面 MUST 提供进入同一标的个股分析工作台的明确入口
- **AND** 缺失的微观结构数据 MUST 显示状态或数据要求

### Requirement: Gold analysis is reachable from cross-asset rotation

行情中心总览 SHALL 从大类资产轮动提供伦敦金分析入口，并在独立子页面展示黄金的 32 项信号。

#### Scenario: User opens gold analysis

- **WHEN** 用户从“大类资产轮动”的伦敦金进入黄金分析
- **THEN** 系统 MUST 打开 `/home/market/gold`
- **AND** 页面 MUST 明确资产为 XAU/USD、美元/盎司
- **AND** 页面 MUST 展示 10 个基础信号、12 个形态和 10 个高级模型
- **AND** 页面 MUST NOT 把黄金混入主要指数或新增行情中心一级 Tab

#### Scenario: Gold has no volume data

- **WHEN** 黄金资产没有可信成交量
- **THEN** RVOL 和 OBV MUST 显示 `not-applicable`
- **AND** 依赖量能的形态 MUST 使用明确的无量能确认规则或显示缺失条件
- **AND** 系统 MUST NOT 补零

### Requirement: Signal summaries and detail preserve identity

行情中心摘要、详情和个股分析 SHALL 使用同一稳定信号 ID、定义版本和对象口径。

#### Scenario: User follows a summary signal

- **WHEN** 用户从行情中心摘要进入详情
- **THEN** 详情 MUST 打开同一 `signal_id` 和同一对象
- **AND** 不得因页面不同改变窗口、方向或数据来源而仍使用相同名称

### Requirement: Signal sections fail independently

行情中心的信号区域 SHALL 与现有行情模块和彼此之间隔离失败。

#### Scenario: Signal API fails

- **WHEN** 信号摘要或详情请求失败
- **THEN** 对应信号区域 MUST 显示错误和重试操作
- **AND** 主要指数、板块排行、K 线或其他已加载内容 MUST 继续可用
