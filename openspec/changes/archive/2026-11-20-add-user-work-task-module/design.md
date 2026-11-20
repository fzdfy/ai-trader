# Design

## Context

当前 `/home/tasks` 是占位页；`work_task` 只服务来源标准与数据事故治理。现有应用使用 Hono + Drizzle、PostgreSQL、React 19、TanStack Query、Preline 和 Tailwind。需求与领域边界见 `proposal.md` 和 `specs/user-work-task/spec.md`。

视觉参考为 `docs/design/prototypes/initial/quant-workbench-assistant-v2.html`，其工作任务页提供三列看板和今日指标，但没有可执行拖拽、详情面板、收件箱、未来任务和移动端完整状态。

## Goals / Non-Goals

**Goals:**

- 保留现有治理任务数据完成原地重命名。
- 新增私有、可排期、可拖拽的个人 task 领域。
- 用本地自然日组织今日、收件箱、未来和全部视图。
- 让来源上下文和 AI 草稿通过同一受控写入路径进入任务。
- 在视觉实现前生成独立探索稿和完整状态截图。

**Non-Goals:**

- 团队、共享、成员分配、评论、提醒推送。
- 重复任务、子任务、时间追踪和硬删除。
- 把 Workflow / Workflow Run 改造成 Work Task。

## Decisions

### Separate governance and personal task domains

`work_task` / `work_task_event` 原地重命名为 `governance_review_task` / `governance_review_task_event`，同时重命名约束、索引、Drizzle exports、服务类型、治理页面路由和文档。个人任务使用 `user_work_task` / `user_work_task_event`。

替代方案是增加 `task_domain` 共用一张表，但两者在 owner、权限、日期和完成语义上不同，会让查询约束和权限条件持续分叉。此决策见 ADR 0007。

### Personal task persistence

`user_work_task` 保存：

- owner、标题、描述、分类、优先级、状态
- 可空计划日期、可选截止时间
- `sort_order`、阻塞原因、完成说明
- 单一来源类型/ID 和 `context_json` 快照
- 创建、更新、完成、取消时间

`user_work_task_event` 只追加生命周期事件：`created`、`started`、`completed`、`reopened`、`canceled`、`restored`。纯编辑和排序不写状态事件。状态变化、阻塞原因归档与顺序更新必须在事务中完成。

### Local natural-day views

客户端提交当前 IANA timezone 和本地 `YYYY-MM-DD`。服务端验证 timezone，并按该时区转换 `completed_at` 的日期边界。视图口径：

- today：未完成且 `scheduled_date <= localDate`，加本地今天完成项
- inbox：`scheduled_date IS NULL` 且未完成
- future：`scheduled_date > localDate` 且未完成
- all：全部状态

不依赖 `trading_calendar`。任务日期和行情交易日是不同概念。

### Drag, ordering and concurrency

使用 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`，拖拽态复用 Preline 的 `dragged` / `hs-dragged` 样式语义。Preline 5.1.0 本身没有拖拽运行时。

- 三列之间允许自由移动；取消不进入拖拽列。
- 同列拖动只更新顺序。
- 跨列拖动更新状态和站位，并写一条状态事件。
- 客户端乐观更新，失败回滚到服务端最近快照。
- 服务端接收 `target_status + before_id + after_id`，事务内验证所有权和目标列后重算整数 `sort_order`。
- 每列提供恢复自动排序；自动规则为高优先级、截止时间、创建时间。
- 键盘 Sensor 和任务操作按钮提供等价路径。

### Source snapshots

个人任务最多有一个主要来源：`stock`、`review`、`screen`、`workflow_run`。

客户端只提交来源类型与 ID；服务端按当前用户权限读取来源并保存必要快照到 `context_json`。来源不可用时允许退化为普通任务并提示。来源深链打开前再次校验访问权限。

### AI draft boundary

AI 工具可以读取当前用户的任务上下文并返回任务草稿、优先级建议或改写。写入仍然调用普通 `POST/PATCH /work-tasks`，且必须由用户点击确认。AI 不拥有自动状态迁移权限，也不能绕过所有权过滤。

### API shape

```text
GET    /api/v1/work-tasks
GET    /api/v1/work-tasks/summary
POST   /api/v1/work-tasks
GET    /api/v1/work-tasks/:id
PATCH  /api/v1/work-tasks/:id
POST   /api/v1/work-tasks/:id/transition
POST   /api/v1/work-tasks/:id/move
POST   /api/v1/work-tasks/order/reset
```

列表支持 `view`、`localDate`、`timezone`、`q`、`category`、`status`、`cursor`。看板主查询返回三列、今日完成率和逾期数；其他视图使用游标分页。

## Visual Design

开始生产前端实现前，从 `docs/design/prototypes/initial/quant-workbench-assistant-v2.html` 复制并创建：

- 探索稿：`docs/design/prototypes/explorations/quant-workbench-user-work-task-v1.html`
- 截图目录：`docs/design/prototypes/explorations/screenshots/user-work-task-v1/`

必须覆盖：

- 今日看板、收件箱、未来、全部
- 新增/编辑详情面板
- 拖拽中、跨列落位、保存失败回滚
- 空、加载、错误、逾期、阻塞、部分保存成功/失败、成功
- 桌面与移动端
- 浅色与深色
- reduced motion、键盘焦点和触摸操作

视觉稿经用户确认前，`tasks.md` 只能包含视觉设计门禁。

## Risks / Trade-offs

- **表重命名破坏已有引用** → 使用单次可回滚迁移，并在迁移测试中验证已有行、外键、索引和事件。
- **用户时区与服务器时区不一致** → 所有“今天”查询显式使用客户端 timezone/localDate，服务端校验 timezone。
- **拖拽顺序并发冲突** → 服务端以事务和任务归属为准，冲突时返回最新排序，前端整体回滚受影响列。
- **乐观更新回滚覆盖其他任务** → 只回滚受影响任务并可重新拉取该列，不覆盖其他成功写入。
- **来源对象后续变化** → 持久化快照；实时标题变化不得改写任务历史。
- **AI 越权写入** → AI 只生成草稿，使用普通认证 API 且在用户确认后提交。
- **新增拖拽依赖体积** → 仅在工作任务路由动态加载看板组件，避免污染其他工作台页面。

## Migration Plan

1. 新建迁移：重命名治理表、事件表、外键、索引和约束；验证已有数据无损。
2. 部署服务端治理代码重命名与兼容测试；再切换治理路由。
3. 创建个人任务表、事件表、索引和服务端 API。
4. 视觉确认后实现前端、拖拽和来源入口。
5. 回滚代码时保留新增个人任务数据；治理表回滚迁移必须同时恢复表名和代码引用。

## Open Questions

无。
