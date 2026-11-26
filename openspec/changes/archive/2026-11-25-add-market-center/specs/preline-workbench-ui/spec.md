# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Unimplemented navigation targets show a development state

确认原型中除行情中心外尚未实现的导航入口 SHALL 保留真实路由，并统一展示开发中状态。

#### Scenario: User opens an unimplemented page

- **WHEN** 用户进入工作任务或研报洞察
- **THEN** 系统 MUST 展示对应页面标题、“正在开发中”和简短说明
- **AND** 页面 MUST NOT 展示伪造的业务数据或操作结果
- **AND** 页面级面包屑 MUST 显示 `Apollo Quant / 当前页面`
