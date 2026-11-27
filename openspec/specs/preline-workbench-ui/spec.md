# preline-workbench-ui Specification

## Purpose

以可验证的原型、Preline 组件和统一主题构建量化 AI 工作台界面，同时保留历史原型并支持渐进迁移。

## Requirements

### Requirement: Original prototypes remain reproducible

项目 SHALL 将确认过的原型基准稿和探索稿分开保存，任何重设计不得直接覆盖原稿。

#### Scenario: A prototype is redesigned
- **WHEN** 设计师或 Agent 开始重设计探索
- **THEN** 系统 MUST 保留原始 HTML 或截图，并在 `docs/design/prototypes/explorations/` 创建独立副本

#### Scenario: A prototype is accepted
- **WHEN** 新原型经视觉与交互确认
- **THEN** 基准原型 MUST 单独更新，探索稿 MUST 继续保留

### Requirement: UI uses a semantic Preline theme

产品界面 SHALL 使用 Preline 语义 CSS 变量和 Tailwind 工具类表达颜色、表面、边框、排版、间距、圆角与阴影。

#### Scenario: A component uses color
- **WHEN** 页面定义背景、文本、边框或状态颜色
- **THEN** 组件 MUST 使用语义 token 或项目语义工具类，不得散落 raw hex

#### Scenario: Theme modes switch
- **WHEN** 用户在浅色和深色模式之间切换
- **THEN** 页面、导航、卡片、表单和助手侧栏 MUST 同步更新且保存用户选择

#### Scenario: A user opens the app for the first time
- **WHEN** 用户本地没有保存主题偏好
- **THEN** 应用 MUST 使用与确认原型一致的浅色主题

#### Scenario: A user chooses system mode
- **WHEN** 用户明确选择“跟随系统”
- **THEN** 应用 MUST 根据操作系统偏好决定浅色或深色

### Requirement: Workbench shell and landing page use Preline

全局导航、认证页和量化工作台首页 SHALL 使用 Preline + Tailwind 实现，并保持现有路由与数据行为。

#### Scenario: A signed-in user opens the workbench
- **WHEN** 用户进入 `/home`
- **THEN** 系统 MUST 展示可收起的工作台侧栏、吸顶页面级导航条、无边框页面标题区、真实数据指标、任务和行情摘要，以及右下角助手悬浮按钮
- **AND** 系统 MUST NOT 展示应用级全局顶栏或重复的首页 AI 入口

#### Scenario: A route changes
- **WHEN** 用户在 Preline 页面之间导航
- **THEN** 需要交互插件的 Preline 组件 MUST 在新页面挂载后重新初始化，并在卸载时清理

### Requirement: UI remains accessible and responsive

工作台 SHALL 支持键盘导航、清晰焦点、语义化结构、窄屏布局和 reduced motion。

#### Scenario: User navigates with keyboard
- **WHEN** 用户使用 Tab 和 Enter 操作导航、菜单或按钮
- **THEN** 所有交互 MUST 可见聚焦并触发预期行为

#### Scenario: Screen width is mobile
- **WHEN** 视口宽度进入移动端范围
- **THEN** 三列工作台 MUST 收敛为可用的单列或抽屉布局，不得出现不可访问的水平溢出

### Requirement: Legacy pages migrate incrementally

在存在多套 UI 依赖的过渡期，迁移 SHALL 按路由清单逐步完成，并持续保持应用可运行。

#### Scenario: Only the workbench shell is migrated
- **WHEN** 其他业务页仍依赖旧组件库
- **THEN** 新旧界面 MUST 共享同一全局主题、认证和路由行为，且任务清单 MUST 明确剩余待迁移页面

### Requirement: System navigation is role-aware

工作台系统入口 SHALL 根据服务端返回的角色显示，不得仅依赖客户端本地状态判断权限。

#### Scenario: A super administrator opens the workbench
- **WHEN** `super_admin` 登录并进入工作台
- **THEN** 系统入口 MUST 显示“数据管理”和“主题设置”
- **AND** “同步中心”和“数据中心” MUST 作为“数据管理”的明确子页面出现

#### Scenario: A normal user opens the workbench
- **WHEN** `user` 登录并进入工作台
- **THEN** 系统入口 MUST 只显示“主题设置”
- **AND** 页面 MUST NOT 显示“数据管理”“同步中心”或“数据中心”的菜单入口

#### Scenario: An unauthorized user opens a protected URL
- **WHEN** `user` 直接访问数据管理页面
- **THEN** 页面 MUST 重定向到工作台或显示无权限状态
- **AND** 不得短暂渲染数据管理内容

#### Scenario: The role is loading
- **WHEN** 页面尚未取得当前用户角色
- **THEN** 系统 MUST 按最小权限隐藏数据管理入口

### Requirement: Role-aware navigation preserves the compact system area

系统入口 SHALL 保持紧凑布局，超级管理员通过单一“数据管理”入口访问同步中心和数据中心。

#### Scenario: Desktop navigation is rendered
- **WHEN** 系统入口显示在桌面侧栏底部
- **THEN** 入口 MUST 使用紧凑图标按钮
- **AND** “同步中心”和“数据中心” MUST NOT 作为两个重复的顶层底部入口

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

确认原型中除行情中心外尚未实现的导航入口 SHALL 保留真实路由，并统一展示开发中状态。

#### Scenario: User opens an unimplemented page
- **WHEN** 用户进入工作任务或研报洞察
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

### Requirement: Market center is a real market intelligence destination

行情中心 SHALL 展示真实的市场发现与明细模块，不再使用“正在开发中”占位页面。

#### Scenario: User opens market center from the sidebar

- **WHEN** 用户从“市场情报”进入“行情中心”
- **THEN** 页面 MUST 展示“总览、板块、个股”三个真实模块入口
- **AND** 页面 MUST NOT 展示“正在开发中”占位状态
- **AND** 页面 MUST 保留统一的工作台页面级导航

### Requirement: Market center navigation preserves hierarchy

行情中心及其子页面 SHALL 使用统一的页面层级，让用户始终知道自己位于市场情报的哪个模块。

#### Scenario: User opens the market center root

- **WHEN** 用户位于 `/home/market`
- **THEN** 页面级面包屑 MUST 显示 `Apollo Quant / 行情中心`

#### Scenario: User opens a market center child page

- **WHEN** 用户位于板块、个股、快速行情详情、板块详情或兼容行情深链接
- **THEN** 页面级面包屑 MUST 包含可点击的“行情中心”父级
- **AND** 当前模块或详情 MUST 作为不可点击的当前页出现
- **AND** 移动端 MUST 保持相同的可访问父级关系

#### Scenario: User opens board detail or anomaly mode

- **WHEN** 用户进入板块详情或板块“异动”模式
- **THEN** 面包屑 MUST 保持 `Apollo Quant / 行情中心 / 板块`
- **AND** 当前板块详情名称或“异动” MUST 作为不可点击的当前页出现

### Requirement: Daily dashboard links resolve to market details

每日看板中的市场摘要入口 SHALL 打开行情中心的对应明细模块，不得跳转到开发占位页或无关模块。

#### Scenario: User opens market detail from a dashboard summary

- **WHEN** 用户从“市场主线”“市场温度”或行情雷达摘要选择查看明细
- **THEN** 系统 MUST 打开与该摘要内容匹配的行情中心模块
- **AND** 明细模块 MUST 保留摘要所表达的行业、概念、资产或资金分类上下文

### Requirement: Main indices use a stable responsive hierarchy

行情中心总览“主要指数”SHALL 以市场基准和六个风格指数组成稳定的桌面与移动端信息层级。

#### Scenario: User reviews main indices on desktop

- **WHEN** 桌面视口展示主要指数
- **THEN** 上证指数 MUST 独占全宽第一行并显示“市场基准”
- **AND** 六个风格指数 MUST 以 `3 × 2` 排列
- **AND** 六个风格指数 MUST 显示角色标签、名称、代码、点位和涨跌幅

#### Scenario: User reviews main indices on mobile

- **WHEN** `390×844` 视口展示主要指数
- **THEN** 上证指数 MUST 保持独立全宽行
- **AND** 六个风格指数 MUST 以 `2 × 3` 排列
- **AND** 页面 MUST NOT 产生横向溢出

#### Scenario: User switches main index mode with keyboard

- **WHEN** “行情 / 相对大盘”切换获得键盘焦点
- **THEN** 用户 MUST 能使用键盘切换模式
- **AND** 当前模式 MUST 具有可见焦点和可访问选中状态
- **AND** 切换到相对大盘后 MUST 显示 5/20/60 日窗口选择

### Requirement: Signal matrix uses a shared semantic presentation

所有页面 SHALL 通过共享语义组件展示信号名称、层级、状态、时间、证据和操作，不得为每个对象复制一套不可复用 UI。

#### Scenario: User compares signal sections

- **WHEN** 用户在大盘、板块、个股或黄金页面查看同一层级信号
- **THEN** 状态颜色、图标、标签和排版 MUST 使用相同语义
- **AND** 颜色 MUST 来自 Preline/Tailwind 语义 token
- **AND** 红涨绿跌 MUST 只用于价格方向，不得误用于所有信号状态

### Requirement: Signal statuses are visually and semantically distinct

界面 SHALL 为触发、中性、失效、低置信、不可用和不适用提供可辨识但不过度依赖颜色的表达。

#### Scenario: User scans a mixed-status matrix

- **WHEN** 同一矩阵包含多种状态
- **THEN** 每个状态 MUST 同时具有文字标签和视觉提示
- **AND** 不可用与中性 MUST 视觉可区分
- **AND** 屏幕阅读器 MUST 读取状态名称和原因

### Requirement: Signal matrix supports progressive disclosure

信号矩阵 SHALL 先展示可扫描的摘要，再按需展开公式、参数、确认条件、失效条件、组成证据和数据来源。

#### Scenario: User opens a dense matrix

- **WHEN** 页面展示 12 至 44 项信号
- **THEN** 首层 MUST 保持分组、筛选和快速扫描能力
- **AND** 详细规则 MUST 在展开后出现
- **AND** 页面 MUST NOT 用 140 张独立大卡纵向堆叠

#### Scenario: User filters signal states

- **WHEN** 用户选择“已触发”“低置信”或“不可用”
- **THEN** 列表 MUST 只展示匹配信号
- **AND** 清除筛选 MUST 恢复全部分组和顺序

### Requirement: Signal matrix is keyboard and assistive-technology accessible

信号筛选、展开、排序、分页和详情跳转 SHALL 支持键盘与屏幕阅读器。

#### Scenario: Keyboard user operates the matrix

- **WHEN** 用户使用 Tab、Enter、Space 和方向键操作信号矩阵
- **THEN** 所有可交互项 MUST 有可见焦点
- **AND** 展开状态 MUST 使用正确的 `aria-expanded`
- **AND** 分组 MUST 有可访问名称

#### Scenario: User changes pages or filters

- **WHEN** 信号矩阵发生筛选、排序或分页
- **THEN** 系统 MUST 提供可读取的结果数量或状态更新
- **AND** MUST NOT 把焦点丢到页面顶部

### Requirement: Signal matrix remains usable on mobile

移动端 SHALL 将密集信号矩阵转换为可横向浏览的紧凑表格或分组行式列表，不得产生页面级横向溢出。

#### Scenario: User views the matrix at 390×844

- **WHEN** 移动端宽度为 `390×844`
- **THEN** 信号状态、名称和主要值 MUST 无需打开弹窗即可看到
- **AND** 证据展开 MUST 在键盘和触控下可用
- **AND** 页面级 MUST NOT 横向溢出

### Requirement: Signal matrix covers all data states and themes

信号矩阵 SHALL 覆盖加载、成功、空、错误和部分成功，并在浅色与深色主题保持可读。

#### Scenario: Matrix is loading

- **WHEN** 信号数据尚未返回
- **THEN** 系统 MUST 展示与最终布局稳定的加载状态
- **AND** 不得用样例信号冒充真实数据

#### Scenario: Matrix is empty

- **WHEN** 当前对象没有任何可用信号
- **THEN** 系统 MUST 展示真实空状态和缺失原因
- **AND** 提供可用数据域的入口或重试

#### Scenario: Matrix partially succeeds

- **WHEN** 部分信号或数据域失败
- **THEN** 系统 MUST 展示部分成功提示和失败范围
- **AND** 已成功信号 MUST 保持可见
- **AND** 用户 MUST 能独立重试失败部分

#### Scenario: Theme changes

- **WHEN** 用户在浅色和深色主题之间切换
- **THEN** 文本、边框、背景、状态和图表颜色 MUST 保持可辨识
- **AND** reduced-motion 用户 MUST NOT 看到非必要动画

### Requirement: Gold analysis uses a dedicated market hierarchy

黄金详情页 SHALL 保持行情中心层级，并清晰表达资产名称、报价单位和数据适用性。

#### Scenario: User views gold analysis

- **WHEN** 用户打开 `/home/market/gold`
- **THEN** 桌面和移动端面包屑 MUST 显示 `Apollo Quant / 行情中心 / 黄金分析`
- **AND** 页面 MUST 明确 XAU/USD 与美元/盎司
- **AND** 无成交量信号 MUST 使用“不适用”状态

### Requirement: Layered judgments remain inside the existing signal panel

对象总判断和各层判断 SHALL 嵌入既有信号面板的原位置，不得新增独立页面或与信号矩阵分离的重复模块。

#### Scenario: User views any signal diagnosis

- **WHEN** 页面展示大盘、板块、个股或黄金的信号矩阵
- **THEN** 对象总判断 MUST 位于原信号面板头部之后
- **AND** 每层判断 MUST 位于对应层级内容的顶部
- **AND** 总判断中的层级入口 MUST 可切换到原层级，并保持可见键盘焦点
- **AND** 移动端 MUST 维持单列阅读顺序且不产生页面级横向溢出
