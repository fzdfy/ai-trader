# Spec Delta

## Purpose

为单只股票提供统一的详情工作台，在同一股票上下文中先展示快速行情，再按需展开深度研究，并保持刷新、深链和浏览器历史可恢复。

## ADDED Requirements

### Requirement: One canonical route owns a single-stock workspace

单只股票详情的唯一规范路由 SHALL 是 `/home/market/stock/:symbol`，并通过
`mode=quick | research` 表达当前深度。

#### Scenario: User opens a stock without a mode

- **WHEN** 用户打开 `/home/market/stock/002594.SZ`
- **THEN** 页面 MUST 默认显示 `mode=quick`
- **AND** 股票身份、行情、K 线、资金和关键信号 MUST 可用
- **AND** 完整研究数据 MUST NOT 因默认打开而加载

#### Scenario: User opens research mode directly

- **WHEN** 用户打开 `/home/market/stock/002594.SZ?mode=research`
- **THEN** 页面 MUST 显示同一股票的深度研究模式
- **AND** URL MUST 保持规范路由和 `mode=research`

### Requirement: Quick and research modes share one stock identity

快速与深度模式 SHALL 共享同一个股票身份头、当前行情、数据时间、主要操作和返回链路。

#### Scenario: User switches to research

- **WHEN** 用户在快速模式点击“深度研究”
- **THEN** 页面 MUST 原地切换到 `mode=research`
- **AND** MUST NOT 导航到另一个股票详情路由
- **AND** 股票代码、名称、行情上下文和来源返回参数 MUST 保留

#### Scenario: User returns to quick mode

- **WHEN** 用户在深度研究模式选择“快速看盘”
- **THEN** 页面 MUST 恢复快速模式
- **AND** 已加载的深度数据 MAY 保留在缓存中
- **AND** 当前 K 线周期和股票 MUST 不变

### Requirement: Research content loads progressively

深度研究 SHALL 在用户首次进入 `research` 时按需加载，并拥有独立于快速行情内容的加载、错误和重试边界。

#### Scenario: Research data is loading

- **WHEN** 用户首次切换到 `mode=research`
- **THEN** 股票身份、行情和快速内容 MUST 保持可见
- **AND** 深度研究区域 MUST 显示稳定的加载状态
- **AND** 页面 MUST NOT 因研究数据延迟而回退到空白页

#### Scenario: Research data fails

- **WHEN** 完整个股分析请求失败
- **THEN** 深度研究区域 MUST 显示错误和重试操作
- **AND** 快速行情、K 线、资金和页面导航 MUST 继续可用
- **AND** 用户 MUST 能切回 `mode=quick`

#### Scenario: Research data partially succeeds

- **WHEN** 某个研究模块失败但其他模块可用
- **THEN** 可用模块 MUST 继续展示
- **AND** 失败模块 MUST 显示独立的部分失败状态

### Requirement: Workspace state survives URL and browser history

股票、模式和来源上下文 SHALL 写入 URL，以便刷新、分享、前进和后退能够恢复同一工作台状态。

#### Scenario: User refreshes research mode

- **WHEN** 用户在 `mode=research` 刷新页面
- **THEN** 系统 MUST 恢复同一股票的深度研究模式

#### Scenario: User navigates back

- **WHEN** 用户从 `research` 返回之前的 `quick` 状态
- **THEN** 浏览器后退 MUST 恢复 `mode=quick`
- **AND** MUST 保留同一股票和适用的来源列表参数

### Requirement: Workspace preserves one visual and interaction hierarchy

统一工作台 SHALL 在桌面和移动端只呈现一个股票身份头、一个模式控制和一个主要返回链路。

#### Scenario: User views the unified page on desktop

- **WHEN** 页面以桌面视口展示
- **THEN** 快速或深度模式 MUST 使用同一个股票主标题和行情摘要
- **AND** MUST NOT 重复渲染第二套股票头、收藏操作或返回按钮

#### Scenario: User views the unified page on mobile

- **WHEN** 页面以移动视口展示
- **THEN** 模式控制 MUST 在股票身份头之后保持可见且可操作
- **AND** 内容 MUST 按快速或深度模式呈现单一纵向阅读顺序
- **AND** 页面 MUST NOT 产生横向溢出

### Requirement: Future forecast uses one median path

统一个股工作台的未来一周预测 SHALL 只绘制一条 P50 中位路径，并使用概率区间表达不确定性。

#### Scenario: User views the future-week forecast

- **WHEN** 用户在快速看盘模式查看未来一周预测
- **THEN** 未来一周预测 MUST 直接绘制在同一 K 线数据画布内
- **AND** 图表 MUST 只绘制一条 P50 中位路径
- **AND** 图表 MAY 使用 P10/P90 概率区间表达不确定性
- **AND** 图表 MUST NOT 绘制偏强、中枢、偏弱等多条情景路径
- **AND** 文案 MUST 明确预测不是目标价

### Requirement: Technical signal matrices open a group drawer

深度研究中的技术信号矩阵 SHALL 以矩阵卡为入口打开完整分组详情，不得要求整页跳转。

#### Scenario: User opens a technical signal matrix

- **WHEN** 用户点击任一技术信号矩阵卡
- **THEN** 页面 MUST 从右侧打开包含该矩阵全部信号、每项状态与读数、矩阵摘要及数据边界的宽抽屉
- **AND** 用户 MUST 能通过关闭按钮或 Escape 关闭抽屉
- **AND** 关闭后键盘焦点 MUST 回到触发该抽屉的矩阵卡
- **AND** 移动端抽屉 MUST 使用可用全宽并保持内容可滚动

#### Scenario: User views a collapsed signal matrix

- **WHEN** 技术信号矩阵以折叠摘要卡显示
- **THEN** 卡片 MUST 明确标注“目录预览 · 前 3 项”
- **AND** 三项 MUST 按信号目录的稳定顺序取前三条
- **AND** 该预览 MUST NOT 被解释为实时最重要、推荐或自动筛选的三条信号
- **AND** 卡片 MUST 提供查看全部 N 项的动作

#### Scenario: User expands one item inside the matrix drawer

- **WHEN** 用户在矩阵抽屉中点击任一信号项
- **THEN** 该项 MUST 在原地展开组成证据、数据边界、版本与时间、规则与参数、确认与失效条件
- **AND** 用户 MUST 能再次点击该项收起
- **AND** 同一时间 MUST 只展开一个信号项
