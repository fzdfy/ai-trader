# 个人工作任务模块设计

状态：方案已澄清，待 PRD / OpenSpec 与视觉稿确认  
日期：2026-11-20  
相关决策：[ADR 0007](../../adr/0007-separate-user-work-tasks-from-governance-review-tasks.md)

## 1. 问题与目标

当前 `/home/tasks` 只是开发中占位页，数据库中的 `work_task` 实际属于数据治理，不是普通用户的个人任务。本方案把两类任务彻底拆分，并建立个人研究待办闭环：

- 用户把个股、复盘、选股候选、Workflow Run 或自己的想法转成人工任务。
- 用户在今日三列看板中开始、完成、恢复、改期和排序任务。
- 未安排日期的任务进入收件箱，未来任务按日期进入未来视图。
- AI 助手可以起草和总结任务，但所有写入必须由用户确认。

### 成功标准

- 用户可以在 20 秒内从任意来源创建一条带上下文的任务。
- 今日、收件箱、未来和全部视图的日期边界及数量一致。
- 拖拽支持鼠标、触摸和键盘，失败时自动回滚。
- 任意用户无法读取或修改其他用户的任务。
- 治理审阅任务重命名后数据与事件完整保留。

## 2. 非目标

- 不实现团队、共享任务、成员分配、评论或提醒推送。
- 不实现重复任务规则和时间追踪。
- 不允许 AI 自动创建、完成、取消或后台修改任务。
- 不以 Work Task 替代 Workflow / Workflow Run。
- 不在本模块中实现硬删除或回收站。

## 3. 领域模型

| 概念 | 定义 |
|---|---|
| Work Task | 归属于单一登录用户的个人人工待办 |
| Today Task Board | 今日及逾期的待开始、进行中、已完成三列看板 |
| Task Inbox | `scheduled_date = null` 的未完成 Work Task |
| Work Task Source | 一条任务唯一的主要来源对象及其创建时快照 |
| Blocked Reason | 进行中任务的等待说明，不是独立状态 |
| Governance Review Task | Data Steward 处理来源标准或数据事故的治理审阅记录 |

### 现有治理任务重命名

采用原地迁移，保留数据：

```text
work_task                    -> governance_review_task
work_task_event              -> governance_review_task_event
/governance/work-tasks       -> /governance/review-tasks
WorkTask (治理代码类型)      -> GovernanceReviewTask
```

治理 API 仍位于 `/api/v1/data-management/governance/` 下。个人任务接口独立使用 `/api/v1/work-tasks`。

## 4. 数据模型

### `user_work_task`

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | bigserial | 主键 |
| `user_id` | text | 服务端 session 写入，外键关联用户 |
| `title` | text | 必填，去首尾空格，1–120 字符 |
| `description` | text | 可空，最多 4000 字符 |
| `category` | text | `research/review/screen/strategy/follow_up/custom` |
| `priority` | text | `low/normal/high` |
| `status` | text | `pending/in_progress/completed/canceled` |
| `scheduled_date` | date | 可空；空值表示收件箱 |
| `due_time` | time | 可空，按用户本地时区解释 |
| `sort_order` | integer | 同一状态列内持久化顺序 |
| `blocked_reason` | text | 可空，最多 500 字符 |
| `completion_note` | text | 可空，最多 2000 字符 |
| `source_type` | text | `stock/review/screen/workflow_run` 或空 |
| `source_id` | text | 来源对象 ID |
| `context_json` | jsonb | 创建时来源快照，不受来源后续变化影响 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 最近修改 |
| `completed_at` | timestamp | 最近完成时间 |
| `canceled_at` | timestamp | 最近取消时间 |

索引：

- `(user_id, status, scheduled_date, sort_order)`
- `(user_id, completed_at)`
- `(user_id, source_type, source_id)`

### `user_work_task_event`

追加式记录：

- `created`
- `started`
- `completed`
- `reopened`
- `canceled`
- `restored`

每次状态变化写入 actor、时间、可选说明和必要 payload。纯文本编辑和列内排序不写状态事件。

## 5. 生命周期

```text
pending <-> in_progress
pending/in_progress -> completed
completed -> pending | in_progress   (reopen)
pending/in_progress -> canceled
canceled -> pending                  (restore)
```

- 完成说明可选。
- 取消和恢复只允许任务所有者操作。
- 离开 `in_progress` 时清空当前 `blocked_reason`，旧原因写入事件 payload。
- 不提供硬删除；取消任务只在“全部”视图出现。

## 6. 视图与日期口径

“今日”按浏览器提供的用户本地日期和 IANA 时区计算，不依赖交易日历。

| 视图 | 内容 |
|---|---|
| 今日 | 未完成且 `scheduled_date <= 今日`，包含逾期；已完成列展示本地日期今天完成的任务 |
| 收件箱 | `scheduled_date = null` 且未完成 |
| 未来 | `scheduled_date > 今日` 且未完成 |
| 全部 | 所有日期和状态，包括取消 |

今日完成率：

```text
今天完成数 / (今天完成数 + 今日列仍未完成数)
```

已完成列按 `completed_at` 倒序；其他列初始按高优先级、截止时间、创建时间排序，用户拖动后按 `sort_order` 排序。

## 7. 页面与交互

### 页面头部

- 标题：工作任务
- 主操作：添加任务
- 真实指标：今日完成、未完成、逾期、收件箱

不展示无法真实计算的专注时长、团队阻塞、自动化节省或虚构头像。

### 视图切换

`今日 / 收件箱 / 未来 / 全部`

- 今日：三列看板。
- 其他视图：行式列表，支持分类、状态、关键词筛选和游标分页。

### Today Task Board

- 列：待开始、进行中、已完成。
- 卡片：标题、分类、优先级、截止时间、来源、逾期/阻塞标识。
- 操作：开始、完成、取消、改期、打开详情。
- 拖拽：三列间自由移动；拖入已完成不强制填写说明。
- 键盘：拖拽句柄可通过键盘移动；所有状态操作另有按钮。
- 移动端：单列分组或横向紧凑切换，不要求精确拖拽才能操作。
- 支持“恢复自动排序”。

拖拽使用 `@dnd-kit/core` + `@dnd-kit/sortable`，拖拽态复用 Preline 的 `dragged` / `hs-dragged` 样式语义。Preline 5.1.0 本身不提供拖拽运行时。

### Work Task Detail Panel

- 页面内右侧面板，移动端全宽。
- 创建与编辑共用。
- 可编辑标题、描述、分类、优先级、计划日期、截止时间、阻塞原因、完成说明。
- 显示来源快照、可访问的来源链接和状态事件。
- 不提供永久删除。

### 状态

覆盖加载、空、错误、离线/请求失败、逾期、阻塞、部分任务保存失败和乐观更新回滚。

## 8. 来源入口

| 来源 | 入口 | 默认内容 |
|---|---|---|
| 个股分析 | 加入工作任务 | 股票代码、名称、当前研究问题 |
| 每日选股候选详情 | 加入工作任务 | 候选代码、策略、评分摘要 |
| 每日复盘 | 创建跟进任务 | 复盘日期、结论、待验证事项 |
| Workflow Run | 生成人工跟进任务 | 工作流名称、运行 ID、失败/待判断摘要 |

客户端只提交 `source_type + source_id`。服务端重新读取来源并生成快照；来源不可见或不存在时不建立关联，但允许用户保存为普通任务并返回提示。

## 9. API

所有接口要求登录，`user_id` 只从 session 读取。

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

列表参数：

```text
view=today|inbox|future|all
localDate=YYYY-MM-DD
timezone=Asia/Shanghai
q=
category=
status=
cursor=
limit=
```

`move` 请求携带 `targetStatus + beforeId + afterId`。服务端事务内验证所有权、更新状态和重算目标列顺序；失败时前端回滚。

## 10. AI 助手

允许：

- 根据当前页面上下文起草任务字段。
- 汇总今日任务并建议优先级。
- 改写标题或补充执行说明。

禁止：

- 自动创建、完成、取消或恢复任务。
- 绕过用户确认写入数据库。
- 读取其他用户任务。

AI 返回草稿后打开 Work Task Detail Panel，由用户点击“创建任务”完成写入。

## 11. 权限与安全

- 所有读写按 `user_id` 强制隔离，不接受客户端传入 owner。
- 详情、状态变更和排序接口均验证任务属于当前用户。
- 来源深链再次检查来源对象访问权限。
- 文本字段限制长度并作为纯文本渲染。
- 不提供硬删除接口。
- 记录跨用户访问尝试为安全日志。

## 12. 性能与可用性

- 今日看板预计每用户几十条任务，可一次返回全部三列。
- 收件箱、未来和全部使用游标分页。
- 拖拽乐观更新，失败回滚并提示。
- 侧栏数量只统计今日未完成；大于 99 显示 `99+`。
- `prefers-reduced-motion` 下关闭拖拽动画。
- 键盘焦点、拖拽说明和屏幕阅读器状态文本必须完整。

## 13. 实施阶段

1. 治理任务原地重命名、数据迁移、代码和文档更新。
2. 新增个人任务 Schema、事件、服务、API、权限和测试。
3. 实现工作任务页、四种视图、详情面板和 `@dnd-kit` 拖拽。
4. 接入个股、选股、复盘、Workflow Run 四处入口和 AI 助手草稿流程。
5. 完成端到端、迁移、并发、移动端、浅色/深色和可访问性验证。

## 14. 测试重点

- 治理任务重命名前后行、外键、索引、事件和 API 行为不变。
- 用户 A 无法读取、修改、排序或恢复用户 B 的任务。
- 今日/收件箱/未来/全部在跨时区、午夜、周末和逾期边界上结果正确。
- 所有状态迁移合法，事件顺序和 blocked reason 归档正确。
- 拖拽跨列、列内排序、键盘操作、触摸操作和失败回滚。
- 来源对象存在、无权限、已删除和重跑后的快照行为。
- AI 只能生成草稿，未确认时数据库无写入。
- 浅色、深色、桌面、移动端截图与 reduced-motion。

## 15. 未决项

无。进入实施前仍需按项目流程完成 PRD / OpenSpec、技术方案评审和已确认的视觉设计稿。
