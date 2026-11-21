# Spec Delta

## MODIFIED Requirements

### Requirement: Workbench shell and landing page use Preline

全局导航、认证页和量化工作台首页 SHALL 使用 Preline + Tailwind 实现，并保持现有路由与数据行为。

#### Scenario: A signed-in user opens the workbench
- **WHEN** 用户进入 `/home`
- **THEN** 系统 MUST 展示可收起的工作台侧栏、吸顶页面级导航条、无边框页面标题区、真实数据指标、任务和行情摘要，以及右下角助手悬浮按钮
- **AND** 系统 MUST NOT 展示应用级全局顶栏或重复的首页 AI 入口

#### Scenario: A route changes
- **WHEN** 用户在 Preline 页面之间导航
- **THEN** 需要交互插件的 Preline 组件 MUST 在新页面挂载后重新初始化，并在卸载时清理

## ADDED Requirements

### Requirement: Page navigation identifies the current workbench page

登录后的业务页面 SHALL 展示吸顶页面级导航条，用于表达当前位置、数据状态并提供站内页面搜索。

#### Scenario: User opens a workbench page
- **WHEN** 用户进入任一登录后业务页面
- **THEN** 页面级导航条 MUST 显示 `Apollo Quant / 通用页面名`
- **AND** 面包屑 MUST 使用可辨识当前页面的通用名称，不等待实体详情查询

#### Scenario: Page content scrolls
- **WHEN** 用户滚动页面内容
- **THEN** 页面级导航条 MUST 保持在内容顶部可见

#### Scenario: User reads the data status
- **WHEN** 页面级导航条展示数据状态
- **THEN** 系统 MUST 使用真实最近同步时间和“数据在线”，不得伪造开盘阶段

#### Scenario: User searches from the page navigation
- **WHEN** 用户点击搜索入口或使用 `Cmd/Ctrl + K`
- **THEN** 系统 MUST 打开站内页面与操作搜索面板
- **AND** 搜索面板 MUST NOT 宣称支持尚未接入的资产或研报全文搜索

#### Scenario: User opens a workbench page on mobile
- **WHEN** 页面宽度进入移动端范围
- **THEN** 页面级导航条 MUST 收敛为页面上下文控制、可点击面包屑父级、当前页面和搜索图标
- **AND** `/home/*` 一级页面 MUST 显示菜单，子页面 MUST 显示可点击的确定性父级面包屑
- **AND** `/ai-chat` MUST 提供会话历史入口，`/news` MUST 通过可点击面包屑返回每日看板

#### Scenario: User returns from a child page
- **WHEN** 用户位于工作流、因子、策略、数据中心或复盘等子页面
- **THEN** 页面级导航条 MUST 显示 `Apollo Quant / 父页面 / 当前页面`
- **AND** 父页面 MUST 以可点击面包屑返回该路由确定的父级页面，不依赖浏览器上一页
- **AND** 当前页面 MUST 不可点击
- **AND** 页面级导航条 MUST NOT 显示独立返回按钮

#### Scenario: User returns from the assistant workspace
- **WHEN** 用户从某个业务页面进入完整助手页
- **THEN** 面包屑 MUST 继续显示当前页面和可点击的 `Apollo Quant` 根级
- **AND** 系统 MUST NOT 显示独立返回按钮

### Requirement: Floating assistant preserves workbench context

登录后的工作台页面 SHALL 通过单一悬浮按钮打开 AI 助手抽屉，并在进入完整助手页前保留当前会话。

#### Scenario: User opens the assistant on a workbench page
- **WHEN** 用户在非完整助手页点击 AI 助手悬浮按钮
- **THEN** 系统 MUST 在当前页面右侧打开助手抽屉，并显示当前页面名称
- **AND** 抽屉头部 MUST 使用“量化助手”标题、真实页面上下文条和“新建、历史、全屏、收起”操作顺序
- **AND** 系统 MUST NOT 将当前页面数据隐式发送给 Agent

#### Scenario: User opens the assistant on a wide screen
- **WHEN** 视口宽度大于助手抽屉的覆盖断点
- **THEN** 主内容 MUST 为助手抽屉让出右侧空间

#### Scenario: User opens the assistant below the coverage breakpoint
- **WHEN** 视口宽度不大于助手抽屉的覆盖断点
- **THEN** 助手抽屉 MUST 覆盖主内容，不得将主内容压缩到不可用宽度

#### Scenario: User closes and reopens the assistant
- **WHEN** 用户关闭助手抽屉并再次打开
- **THEN** 系统 MUST 在同一页面会话内恢复上次打开的助手会话

#### Scenario: User navigates while the assistant is open
- **WHEN** 用户在助手抽屉打开时导航到另一个业务页面
- **THEN** 系统 MUST 关闭抽屉并保留当前助手会话供下次恢复

#### Scenario: User opens the assistant on mobile
- **WHEN** 用户在移动端点击 AI 助手悬浮按钮
- **THEN** 系统 MUST 打开全宽助手抽屉并隐藏悬浮按钮
- **AND** 用户 MUST 能通过明确的关闭操作返回原页面

#### Scenario: Assistant has no unread state
- **WHEN** 系统没有真实的助手未读消息状态
- **THEN** 悬浮按钮 MUST NOT 显示伪造的通知点

#### Scenario: User expands the assistant
- **WHEN** 用户在已有会话的助手抽屉中进入完整会话
- **THEN** 系统 MUST 进入该会话的完整助手页
- **WHEN** 用户尚无会话时进入完整助手
- **THEN** 系统 MUST 进入新会话页

### Requirement: Navigation simplification preserves deep routes

从工作台侧栏移除菜单组 SHALL NOT 删除对应业务页面或破坏已有深链接。

#### Scenario: User opens a removed menu route directly
- **WHEN** 用户通过已有书签或页面内链接打开信号或知识库页面
- **THEN** 系统 MUST 正常展示对应页面
- **AND** 工作台侧栏 MUST NOT 展示“信号”或知识库入口

### Requirement: Workbench navigation follows user intent

工作台侧栏 SHALL 按“工作空间、市场情报、量化研究、流程自动化”组织业务入口，并将低频系统能力固定展示为底部图标按钮。

#### Scenario: User scans the primary navigation
- **WHEN** 用户展开工作台侧栏
- **THEN** 侧栏 MUST 依次展示工作空间、市场情报、量化研究和流程自动化四组
- **AND** 工作空间 MUST 展示每日看板、工作任务、每日复盘和每日选股
- **AND** 市场情报 MUST 展示行情中心和研报洞察
- **AND** 量化研究 MUST 展示策略、因子、回测、衰退对比和因子迭代
- **AND** 流程自动化 MUST 展示工作流
- **AND** 侧栏 MUST NOT 展示知识库或系统分组

#### Scenario: User views the system navigation
- **WHEN** 用户查看侧栏底部
- **THEN** 系统 MUST 按数据状态、同步中心/数据中心/主题设置三个 33×33px 图标、用户卡片的顺序展示
- **AND** 展开侧栏中的三个图标 MUST 以 6px 间距横向排列
- **AND** 系统 MUST NOT 把新闻、知识库或业务研究入口放入系统入口

#### Scenario: Sidebar is collapsed
- **WHEN** 用户将桌面侧栏收起
- **THEN** 同步中心、数据中心和主题设置 MUST 继续以 5px 间距的纵向图标和 tooltip 形式展示
- **AND** 数据状态 MUST 收敛为圆点，用户卡片 MUST 只保留头像

#### Scenario: User compares the sidebar with the prototype
- **WHEN** 桌面侧栏展开
- **THEN** 侧栏宽度 MUST 为 238px，收起宽度 MUST 为 68px
- **AND** 背景 MUST 使用原型蓝灰渐变，侧栏 MUST NOT 绘制右侧边框

#### Scenario: User opens the workflow list
- **WHEN** 用户从流程自动化分组进入工作流
- **THEN** 系统 MUST 展示当前用户的工作流行式列表
- **AND** 页面 MUST 保留统一页面级导航

### Requirement: Unimplemented navigation targets show a development state

确认原型中尚未实现的导航入口 SHALL 保留真实路由，并统一展示开发中状态。

#### Scenario: User opens an unimplemented page
- **WHEN** 用户进入工作任务、行情中心或研报洞察
- **THEN** 系统 MUST 展示对应页面标题、“正在开发中”和简短说明
- **AND** 页面 MUST NOT 展示伪造的业务数据或操作结果
- **AND** 页面级面包屑 MUST 显示 `Apollo Quant / 当前页面`

### Requirement: Workbench prioritizes daily decisions

每日看板 SHALL 通过真实数据展示数据可信度、市场状态、资金主线、市场温度、选股、工作流、资讯和最近复盘。

#### Scenario: User opens the workbench
- **WHEN** 用户进入 `/home`
- **THEN** 页面 MUST 展示数据状态、行业广度、资金广度、涨停家数和股票池候选数
- **AND** 页面 MUST 依次展示市场主线、市场温度、每日选股、今日工作流、资讯增量和最近复盘
- **AND** 每个数据模块 MUST 显示其真实快照日期

#### Scenario: Market snapshots are stale
- **WHEN** 最新行情日期早于当前日期
- **THEN** 首屏 MUST 显示行情快照日期和滞后天数
- **AND** 系统 MUST NOT 将旧行情描述为今日或实时行情

#### Scenario: User reviews market leadership
- **WHEN** 资金流和板块快照可用
- **THEN** 市场主线模块 MUST 展示行业与概念资金流前五、净流入、涨跌幅和代表个股
- **AND** 用户 MUST 能进入行情中心查看明细

#### Scenario: User reviews market temperature
- **WHEN** 涨停池快照可用
- **THEN** 市场温度模块 MUST 展示涨停家数、最高连板、最大封单、平均换手、开板样本和连板梯队

#### Scenario: User reviews daily candidates
- **WHEN** 股票池快照可用
- **THEN** 每日选股模块 MUST 展示最高评分候选的名称、代码、来源和评分
- **AND** 用户 MUST 能进入每日选股页面查看全部候选

#### Scenario: Workflow data is not available
- **WHEN** 当前用户今天没有工作流运行
- **THEN** 工作台 MUST 展示真实空状态和最近一次运行记录
- **AND** 系统 MUST NOT 展示伪造的运行状态

#### Scenario: Daily dashboard data is unavailable
- **WHEN** 任一数据域没有快照
- **THEN** 对应模块 MUST 显示真实空状态
- **AND** 其他可用模块 MUST 继续展示

### Requirement: Review attribution keeps current and history connected

工作空间 SHALL 使用单一“每日复盘”入口，并保持当前复盘与历史复盘之间的页面内跳转。

#### Scenario: User enters the review module
- **WHEN** 用户点击侧栏“每日复盘”
- **THEN** 系统 MUST 打开今日复盘页面
- **AND** 侧栏 MUST NOT 同时展示独立的今日复盘和历史复盘菜单

#### Scenario: User opens history from today
- **WHEN** 用户在每日复盘页点击“历史复盘”
- **THEN** 系统 MUST 打开历史复盘列表

#### Scenario: User returns from history
- **WHEN** 用户在历史复盘页点击面包屑父级“每日复盘”
- **THEN** 系统 MUST 返回今日复盘页面
