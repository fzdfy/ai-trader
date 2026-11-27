# Spec Delta

## ADDED Requirements

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
