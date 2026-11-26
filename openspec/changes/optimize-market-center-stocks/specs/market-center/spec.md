# Spec Delta

## ADDED Requirements

### Requirement: Stock list uses stable URL-backed pagination

行情中心个股模块的全市场、搜索结果和自选结果 SHALL 使用每页 10 只、按股票代码升序的标准分页，并把 `tab`、`page`、`q` 作为可恢复的页面状态。

#### Scenario: User browses full-market stocks

- **WHEN** 用户打开“全市场”个股列表
- **THEN** 页面 MUST 展示最多 10 只股票
- **AND** 股票 MUST 按股票代码升序排列
- **AND** 分页 MUST 同时显示当前范围、总数和页数

#### Scenario: User searches or changes list scope

- **WHEN** 用户提交新的股票搜索或切换“全市场 / 我的自选”
- **THEN** 系统 MUST 从第 1 页重新加载结果
- **AND** 仅适用于旧搜索或旧 Tab 的页码 MUST 被清理

#### Scenario: User restores a paginated list

- **WHEN** 用户刷新页面、使用浏览器前进/后退，或打开包含 `tab`、`page`、`q` 的地址
- **THEN** 页面 MUST 恢复对应的列表范围、搜索条件和页码
- **AND** 当前搜索结果或自选结果 MUST 继续按股票代码升序排列

#### Scenario: Requested page exceeds available pages

- **WHEN** URL 中的页码超过当前结果的最大页数
- **THEN** 系统 MUST 定位到最后一个有效页并同步更新 `page`
- **AND** 无匹配结果时 MUST 定位到第 1 页并显示明确空状态

#### Scenario: Stock list has no matching results

- **WHEN** 全市场搜索或当前用户的自选列表返回 0 只股票
- **THEN** 页面 MUST 显示真实空状态
- **AND** 分页 MUST NOT 生成可访问但不存在的页码

### Requirement: Watchlist access uses authenticated server identity

自选股票列表及添加、删除操作 SHALL 使用 Better Auth 服务端 Session 识别当前用户，不得信任客户端提供的用户身份头。

#### Scenario: User reads a paginated or legacy watchlist

- **WHEN** 登录用户读取自选股票
- **THEN** 服务端 MUST 从 Better Auth Session 获取用户身份
- **AND** 返回值 MUST 只包含该用户拥有的自选股票
- **AND** 分页与旧数组两种响应模式 MUST 使用相同 owner 边界

#### Scenario: Client supplies a forged user header

- **WHEN** 请求携带与当前 Session 不一致的 `X-User-Id`
- **THEN** 服务端 MUST 忽略该身份头
- **AND** 请求结果 MUST 仍只属于 Session 用户

#### Scenario: User modifies the watchlist without a session

- **WHEN** 未登录请求添加或删除自选股票
- **THEN** 服务端 MUST 返回 `401`
- **AND** 系统 MUST NOT 写入或删除任何用户自选数据

#### Scenario: Pagination parameters are incomplete

- **WHEN** 自选请求只提供 `page` 或只提供 `limit`
- **THEN** 服务端 MUST 返回 `400`
- **AND** 系统 MUST NOT 静默退化为旧数组响应

#### Scenario: User changes account in the same browser

- **WHEN** 当前 Session 用户变化或退出登录
- **THEN** 前端 MUST NOT 复用上一用户的自选缓存
- **AND** 自选查询 MUST 等到新 Session 明确后再启用
- **AND** 新用户 MUST 只能看到自己的自选数据

#### Scenario: Session user changes in the same browser

- **WHEN** 同一浏览器从一个登录用户切换到另一个用户或退出登录
- **THEN** 页面 MUST NOT 展示上一用户缓存的自选数据
- **AND** watchlist 查询 MUST 在当前 Session 用户确定后才启用

### Requirement: Quick quote detail prioritizes the chart before capital structure

行情中心的快速行情详情 SHALL 按股票名称/代码/价格、K 线、资金结构的顺序组织内容，并保持与个股分析页面的职责边界。成交额、主力净流入、PE 等重复指标 SHALL NOT 再以独立指标卡展示。

#### Scenario: User opens a quick quote detail

- **WHEN** 用户从个股列表选择一只股票
- **THEN** 页面 MUST 先展示股票名称、代码、最新价和涨跌幅
- **AND** K 线 MUST 位于资金结构之前
- **AND** K 线下方 MUST 直接展示资金结构，不得插入重复指标卡
- **AND** 行情标题、K 线和资金结构 MUST 位于同一张连续卡片
- **AND** 图表标题下方 MUST NOT 展示实现说明文字
- **AND** 股票名 MUST 加粗并与代码组成单行标题
- **AND** 最新价和涨跌幅 MUST 紧跟标题，并按涨红跌绿着色
- **AND** 标题下方 MUST 显示成交额、PE、PE-TTM 和 PB
- **AND** 图表区域 MUST NOT 重复显示股票名/代码常驻标题
- **AND** OHLC/MA MUST 在独立信息条中展示，不得覆盖 K 线绘图区
- **AND** 鼠标移动到某一天时，信息条 MUST 显示该日期的 OHLC、成交量和截至该日的 MA
- **AND** 信息条 MUST 同时显示该日期的成交额
- **AND** 移出十字线后，信息条 MUST 恢复最新一天
- **AND** 资金结构 MUST 继续展示可用口径与快照时间

#### Scenario: Capital evidence is unavailable

- **WHEN** 当前股票没有可用资金结构快照
- **THEN** 资金结构区域 MUST 显示真实空状态或错误状态
- **AND** K 线主图和行情标题 MUST 继续展示

#### Scenario: User enters deep stock analysis

- **WHEN** 用户从快速行情详情进入“个股分析”
- **THEN** 系统 MUST 打开同一标的的个股分析页面
- **AND** 个股分析页面 MUST NOT 被快速行情详情的内容顺序约束
