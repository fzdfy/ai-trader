# Proposal

## Why

当前 `/home/tasks` 只有开发中占位页，而数据库中的 `work_task` 实际只服务数据治理。用户缺少把个股、复盘、选股候选、Workflow Run 或临时研究想法转成个人人工待办的闭环，也容易把 Work Task、Workflow 和 Governance Review Task 混为一谈。现在先拆分领域并建立个人任务模型，可在数据继续增长前修正权限和生命周期边界。

## PRD-lite

### 目标用户

已登录的量化研究用户，在桌面或移动端管理当天与未来的个人研究待办。

### 核心场景

- 手动创建、编辑、安排和取消个人任务。
- 从个股、复盘、选股候选或 Workflow Run 创建带来源快照的跟进任务。
- 在今日三列看板中开始、完成、恢复、改期和排序任务。
- 在收件箱安排尚未排期的任务，在未来视图检查后续工作。
- 通过 AI 助手起草任务或总结优先级，但确认后才写入。

### 成功指标

- 从来源创建任务不超过 20 秒。
- 今日、收件箱、未来与全部视图的数量和日期口径一致。
- 拖拽失败可回滚，键盘和触摸均可完成任务状态切换。
- 用户 A 无法读取或修改用户 B 的任务。
- 治理任务重命名迁移后历史数据、事件和权限完整。

### 非目标

- 团队、共享任务、成员分配、评论和系统提醒。
- 重复任务、时间追踪、子任务和硬删除。
- AI 后台自动生成、完成或取消任务。
- 用 Work Task 替代 Workflow / Workflow Run。

## What Changes

- **BREAKING** 将现有治理 `work_task` / `work_task_event` 原地重命名为 `governance_review_task` / `governance_review_task_event`，并同步重命名治理代码、管理路由和文档术语。
- 新增个人 `user_work_task` / `user_work_task_event`，按登录用户隔离。
- 新增任务收件箱、计划日期、截止时间、分类、优先级、阻塞原因、完成说明和来源快照。
- 新增今日、收件箱、未来、全部视图；今日为待开始、进行中、已完成三列看板。
- 新增 `@dnd-kit` 拖拽、列内手动排序和恢复自动排序，复用 Preline 的拖拽样式语义。
- 新增个股、每日选股、每日复盘和 Workflow Run 四个任务来源入口。
- AI 助手可起草任务和建议优先级，但必须经用户确认后调用普通写入接口。

## Capabilities

### New Capabilities

- `user-work-task`: 定义个人任务的数据、所有权、生命周期、日期视图、拖拽排序、来源快照和 AI 草稿边界。

### Modified Capabilities

- `governance-review-tasks`: 将治理审阅记录统一命名为 Governance Review Task，并明确其与个人 Work Task 的领域边界。

## Impact

- 数据库：两张治理表原地重命名；新增两张个人任务表、约束和索引。
- 服务端：重命名现有治理任务服务；新增个人任务服务、列表/看板/详情/状态/排序/来源快照 API 和权限校验。
- 前端：新增工作任务页面、四种视图、详情面板、拖拽看板、侧栏计数和四处来源入口。
- 依赖：新增 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`。
- AI：新增受控任务草稿/总结能力，不允许后台自动写入。
- 文档：更新治理任务路由、数据目录、术语、ADR、前端标准和运行手册。
- 兼容性：治理表名和内部路由变更属于 **BREAKING**，迁移必须保留全部已有数据；个人任务为纯新增。

## Visual Design Impact

Visual design: required.

受影响页面为 `/home/tasks`，包括今日三列看板、收件箱/未来/全部列表、任务详情面板、拖拽态和四处“加入工作任务”入口。必须覆盖空、加载、错误、逾期、阻塞、部分保存失败、成功，以及桌面/移动端、浅色/深色和 reduced-motion。

默认参考稿为 `docs/design/prototypes/initial/quant-workbench-assistant-v2.html`。实施前必须从该稿复制到 `docs/design/prototypes/explorations/` 创建独立探索稿，并提交桌面和移动端、浅色和深色截图，经用户明确确认后才能创建生产实现任务。
