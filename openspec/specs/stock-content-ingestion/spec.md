# stock-content-ingestion Specification

## Purpose
为自选股和主动分析的个股提供可追溯、可降级且幂等的新闻、公告和研报数据，并在个股分析页面独立呈现每类数据的刷新状态。

## Requirements

### Requirement: Stock content uses approved source chains

个股新闻 SHALL 优先使用东财个股新闻接口并以新浪 7×24 作为备源；公告 SHALL 优先使用巨潮并以交易所官方或东财作为备源；研报 SHALL 使用现有东财研报 Provider。

#### Scenario: News primary succeeds
- **WHEN** 东财个股新闻接口返回有效文章
- **THEN** 系统 MUST 使用东财结果并保留来源、标题、正文、发布时间和原文链接

#### Scenario: News primary fails
- **WHEN** 东财个股新闻接口失败、熔断或返回被风控的空结果
- **THEN** 系统 MUST 尝试新浪个股新闻备源
- **AND** 系统 MUST 在结果中保留实际使用来源

#### Scenario: Announcement primary fails
- **WHEN** 巨潮公告接口不可用
- **THEN** 系统 MUST 尝试对应交易所官方或东财公告备源

### Requirement: Eastmoney content requests use the shared limiter

东财新闻、公告和研报请求 SHALL 通过 quant Provider 的统一东财限流、重试和熔断入口执行。

#### Scenario: An Eastmoney content request is made
- **WHEN** 系统请求任一东财内容接口
- **THEN** 请求 MUST 遵守 `_em_get()` 的最小请求间隔、重试和熔断规则

### Requirement: Stock news is linked to the queried symbol

按个股采集新闻时，系统 SHALL 至少把成功入库的文章显式关联到当前查询标的，并 MAY 同时关联正文中识别出的其他标的。

#### Scenario: An article contains no stock code
- **WHEN** 东财按 `002594.SZ` 返回一篇正文没有六位股票代码的新闻
- **THEN** 系统 MUST 仍将该文章关联到 `002594.SZ`

#### Scenario: An article mentions multiple stocks
- **WHEN** 新闻正文包含当前标的和另一个有效 A 股代码
- **THEN** 系统 MUST 保存两个有效的个股关联且不产生重复关联

### Requirement: Content ingestion is idempotent

新闻、公告和研报 SHALL 使用稳定业务键去重，重复同步不得重复插入同一条内容。

#### Scenario: The same article is synchronized twice
- **WHEN** 同一来源和 URL 的新闻再次同步
- **THEN** 系统 MUST 复用原文章并保持个股关联幂等

#### Scenario: The same announcement is synchronized twice
- **WHEN** 同一标的、来源和公告标识再次同步
- **THEN** 系统 MUST 更新或复用原记录，不得重复创建

### Requirement: Initial backfill is bounded

首次接入 SHALL 为每只自选股回填最近 20 条个股新闻、最近 30 天公告和最近 12 个月研报元数据。

#### Scenario: A watchlist symbol has large history
- **WHEN** 首次同步自选股内容
- **THEN** 系统 MUST 按上述窗口截断，不得抓取全部历史

### Requirement: Content synchronization supports schedule and on-demand use

系统 SHALL 定时同步自选股内容，并 SHALL 允许任意个股通过分析页触发按需刷新。

#### Scenario: Scheduled watchlist sync runs
- **WHEN** 到达新闻、公告或研报的同步时间
- **THEN** 系统 MUST 仅处理当前自选股

#### Scenario: A non-watchlist stock is analyzed
- **WHEN** 用户对非自选股点击“重新分析”
- **THEN** 系统 MUST 为该标的执行同一套新闻、公告和研报增量同步

### Requirement: Stock analysis refresh isolates content failures

个股分析的统一刷新 SHALL 并行刷新新闻、公告和研报，并分别返回每类数据的成功数量、失败原因和最后更新时间。

#### Scenario: One content source fails
- **WHEN** 新闻成功但公告上游失败
- **THEN** 新闻模块 MUST 展示新数据
- **AND** 公告模块 MUST 显示失败状态及可重试提示
- **AND** 研报和行情分析 MUST 继续可用

#### Scenario: All content sources succeed
- **WHEN** 新闻、公告和研报均刷新成功
- **THEN** 页面 MUST 更新三类模块、数量、来源和最后更新时间

### Requirement: Non-watchlist analysis triggers bounded metadata sync

非自选股首次进入分析页时，系统 SHALL 后台触发一次最近 12 个月研报元数据同步，并避免重复上游请求。

#### Scenario: First analysis of a non-watchlist symbol
- **WHEN** 非自选股在本地没有研报元数据
- **THEN** 系统 MUST 在后台触发一次最近 12 个月元数据同步
- **AND** 页面首屏 MUST NOT 等待上游同步

#### Scenario: Repeated visits within the cache window
- **WHEN** 同一非自选股在 24 小时内再次进入分析页
- **THEN** 系统 MUST 复用本地元数据或已有任务
- **AND** MUST NOT 自动重复请求上游

#### Scenario: User refreshes explicitly
- **WHEN** 用户点击“重新分析”
- **THEN** 系统 MAY 强制执行增量元数据刷新
- **AND** 全文索引 MUST 仍由独立后台任务执行
