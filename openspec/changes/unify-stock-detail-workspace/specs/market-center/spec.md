# Spec Delta

## MODIFIED Requirements

### Requirement: Stocks module supports search watchlist and quote discovery

个股模块 SHALL 支持按代码或名称搜索 A 股、管理当前用户自选股、浏览全市场行情结果，并进入统一单只股票工作台的快速模式。

#### Scenario: User searches for a stock

- **WHEN** 用户输入代码或名称并提交搜索
- **THEN** 系统 MUST 展示匹配的 A 股结果
- **AND** 无匹配结果时 MUST 显示明确空状态

#### Scenario: User reviews watchlist

- **WHEN** 用户切换到自选
- **THEN** 系统 MUST 只展示当前用户的自选股票及可用行情
- **AND** 自选为空时 MUST 提供进入股票搜索或板块发现的入口

#### Scenario: User opens a stock from quotes

- **WHEN** 用户选择一只股票
- **THEN** 系统 MUST 打开统一股票工作台的 `mode=quick`
- **AND** 同一页面 MUST 提供切换到 `mode=research` 的操作
- **AND** 行情列表 MUST NOT 在右侧或下方内嵌一份重复的快速详情

### Requirement: Market center preserves stable deep links

行情中心 SHALL 提供稳定可访问的模块和详情路径，信息架构调整不得使已有板块、个股、热力图或资金流深链接失效。

#### Scenario: User opens an existing market deep link

- **WHEN** 用户通过书签或页面内链接打开既有板块、个股、快速行情详情、热力图或资金流路径
- **THEN** 系统 MUST 展示对应内容，或通过明确兼容路径到达等价内容
- **AND** 页面导航 MUST 表达当前页面与行情中心的层级关系

#### Scenario: User opens the former stock analysis detail route

- **WHEN** 用户打开 `/home/market/analysis/:symbol`
- **THEN** 系统 MUST 将单股分析兼容到 `/home/market/stock/:symbol?mode=research`
- **AND** `/home/market/analysis/compare` MUST 继续作为独立对比页面

#### Scenario: User enters stock analysis from market detail

- **WHEN** 用户在统一股票工作台的快速模式选择“深度研究”
- **THEN** 系统 MUST 在同一标的和同一路由切换到 `mode=research`
- **AND** 返回链路 MUST 保留从行情中心到个股研究的上下文

### Requirement: Stock list exposes discovery signals and quick detail exposes a compact matrix

行情中心个股列表 SHALL 展示少量可排序的发现型信号；统一股票工作台的快速模式 SHALL 展示当前标的的技术结论，并提供原地进入完整矩阵的入口。

#### Scenario: User scans the stock list

- **WHEN** 用户浏览全市场或自选股票
- **THEN** 系统 MUST 展示少量可排序信号摘要
- **AND** 每个摘要 MUST 链接到同一 `signal_id` 的详情
- **AND** 列表 MUST NOT 展示全部 44 项个股信号

#### Scenario: User opens quick quote detail

- **WHEN** 用户进入 `/home/market/stock/$symbol`
- **THEN** 页面 MUST 在现有行情摘要、K 线和资金结构之外展示可用技术标签
- **AND** 页面 MUST 提供原地切换到 `mode=research` 的明确入口
- **AND** 缺失的微观结构数据 MUST 显示状态或数据要求
