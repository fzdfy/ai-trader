# Spec Delta

## Purpose

为登录用户提供私有、可排期、可跟踪且支持人工执行闭环的个人研究待办，并保持与 Workflow、Workflow Run 和治理审阅任务的清晰边界。

## ADDED Requirements

### Requirement: Work Tasks are private to their owner

个人 Work Task SHALL 仅允许其所有者读取、创建、修改、排序、完成、取消或恢复。

#### Scenario: Another user requests a task
- **WHEN** 用户 B 请求用户 A 的任务详情、更新、状态迁移或排序接口
- **THEN** 服务端 MUST 拒绝该请求且不得返回任务内容

#### Scenario: A task is created
- **WHEN** 已登录用户创建 Work Task
- **THEN** 服务端 MUST 从 session 写入所有者，不接受客户端指定 owner

### Requirement: Tasks support inbox and scheduled dates

Work Task SHALL 允许任务没有计划日期，也 SHALL 允许设置计划日期和可选截止时间。

#### Scenario: A task has no scheduled date
- **WHEN** 用户保存未安排日期的任务
- **THEN** 任务 MUST 出现在收件箱

#### Scenario: A task is scheduled in the future
- **WHEN** 用户为任务设置晚于本地今天的日期
- **THEN** 任务 MUST 出现在未来视图且不得提前进入今日看板

### Requirement: Today view uses local natural dates

今日视图 SHALL 按用户本地自然日计算，不依赖交易日历。

#### Scenario: An incomplete task is overdue
- **WHEN** 未完成任务的计划日期早于用户本地今天
- **THEN** 今日视图 MUST 展示该任务并标记为逾期

#### Scenario: A task is completed today
- **WHEN** 任务的完成时间落在用户本地今天
- **THEN** 已完成列 MUST 展示该任务并计入今日完成率

### Requirement: Task lifecycle is explicit and traceable

Work Task SHALL 支持待开始、进行中、已完成和已取消状态，并记录状态变化事件。

#### Scenario: A completed task is reopened
- **WHEN** 所有者重新打开已完成任务
- **THEN** 系统 MUST 将任务状态改为待开始并记录重新打开事件

#### Scenario: A task leaves in-progress state
- **WHEN** 进行中任务被开始以外的状态迁移
- **THEN** 系统 MUST 清空当前阻塞原因并把旧原因保留在事件上下文

#### Scenario: A canceled task is restored
- **WHEN** 所有者在全部视图恢复已取消任务
- **THEN** 任务 MUST 回到待开始状态并记录恢复事件

### Requirement: Today board supports status drag and manual order

今日看板 SHALL 通过待开始、进行中和已完成三列管理任务状态与列内顺序。

#### Scenario: A task is dragged between columns
- **WHEN** 用户把任务拖到另一个状态列
- **THEN** 系统 MUST 保存目标状态和目标位置并写状态事件

#### Scenario: Tasks are reordered in one column
- **WHEN** 用户在相同状态列内拖动任务
- **THEN** 系统 MUST 持久化新的列内顺序但不写状态事件

#### Scenario: Automatic order is restored
- **WHEN** 用户请求恢复某一列的自动排序
- **THEN** 系统 MUST 按高优先级、截止时间、创建时间重排该列

#### Scenario: Drag persistence fails
- **WHEN** 拖拽保存请求失败
- **THEN** 前端 MUST 回滚到拖拽前顺序并显示可重试错误

### Requirement: Keyboard and touch can perform task actions

任务状态和排序 SHALL 提供不依赖鼠标的等价操作。

#### Scenario: A keyboard user moves a task
- **WHEN** 用户聚焦拖拽句柄并使用键盘移动
- **THEN** 任务 MUST 可跨列或列内移动并保持可见焦点

#### Scenario: A mobile user changes status
- **WHEN** 用户无法可靠拖拽卡片
- **THEN** 任务详情或卡片操作 MUST 提供开始、完成、取消和改期入口

### Requirement: Tasks retain source context snapshots

Work Task SHALL 最多关联一个主要来源，并在创建时保存来源快照。

#### Scenario: A task is created from a stock
- **WHEN** 用户从个股分析加入工作任务
- **THEN** 任务 MUST 保存来源类型、来源标识、股票代码和标题快照

#### Scenario: The source changes later
- **WHEN** 来源页面重新运行或原始标题变化
- **THEN** 已有的 Work Task 快照 MUST 保持可读

#### Scenario: The source is unavailable
- **WHEN** 服务端无法解析或授权来源对象
- **THEN** 系统 MUST 不建立来源关联，并允许用户保存普通任务或取消创建

### Requirement: AI creates task drafts only after confirmation

AI 助手 SHALL 可以生成任务草稿、总结今日任务和建议优先级，但 MUST NOT 未经确认写入或改变任务。

#### Scenario: AI proposes a task
- **WHEN** AI 根据页面上下文生成任务草稿
- **THEN** 系统 MUST 打开预填充的详情面板且不得在确认前创建任务

#### Scenario: AI is asked to complete a task
- **WHEN** 用户要求 AI 自动完成任务、取消任务或修改其他用户任务
- **THEN** AI MUST 拒绝该操作并引导用户使用授权界面

### Requirement: Task page exposes loading empty error and partial states

工作任务页面 SHALL 在桌面和移动端、浅色和深色主题中展示可理解且可恢复的状态。

#### Scenario: Some task writes fail
- **WHEN** 一个乐观更新失败而其他任务保持成功
- **THEN** 页面 MUST 只回滚失败项并保留其他成功结果

#### Scenario: A view has no tasks
- **WHEN** 用户进入没有任务的今日、收件箱、未来或全部视图
- **THEN** 页面 MUST 显示对应空态和下一步操作
