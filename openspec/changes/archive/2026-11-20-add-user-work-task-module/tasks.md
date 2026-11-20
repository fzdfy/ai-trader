# Tasks

## 0. Visual Design Gate

- [x] 0.1 从 `docs/design/prototypes/initial/quant-workbench-assistant-v2.html` 创建 `docs/design/prototypes/explorations/quant-workbench-user-work-task-v1.html`，覆盖今日看板、收件箱、未来、全部、详情面板、拖拽中/落位/失败回滚、逾期、阻塞、空、加载、错误、部分成功和成功状态；验证探索稿不覆盖任何历史原型
- [x] 0.2 使用真实浏览器生成桌面/移动端与浅色/深色截图，保存到 `docs/design/prototypes/explorations/screenshots/user-work-task-v1/`；验证无控制台错误、横向溢出、不可读状态、键盘焦点丢失或 reduced-motion 违规
- [x] 0.3 提交视觉探索稿、截图与检查报告，交由用户确认三列看板、视图切换、详情面板、拖拽反馈和任务卡信息层级；确认前不得增加生产实现任务

## 1. Governance Review Task 迁移

- [x] 1.1 将 `work_task` / `work_task_event` 原地迁移为 `governance_review_task` / `governance_review_task_event`，同步约束、索引、外键、Drizzle Schema、服务、API、页面路由和测试，并验证历史行与事件无损

## 2. 个人任务后端

- [x] 2.1 新增 `user_work_task` / `user_work_task_event` 迁移、约束和索引，验证所有者隔离、状态和日期边界
- [x] 2.2 实现任务列表、今日汇总、创建、详情、编辑、状态迁移、拖拽移动和恢复自动排序服务，验证事务、事件、阻塞原因归档和并发排序
- [x] 2.3 实现 `/api/v1/work-tasks` API 与服务端来源快照，验证未登录 401、非法参数 400、跨用户 404 和来源不可用时退化为普通任务

## 3. 个人任务前端

- [x] 3.1 实现 TanStack Query hooks、今日三列看板、收件箱/未来/全部列表、详情面板和创建编辑表单，覆盖加载、空、错误和部分保存失败
- [x] 3.2 接入 `@dnd-kit` 跨列拖拽、列内排序、键盘操作、触摸状态按钮、失败回滚和 reduced motion
- [x] 3.3 接入个股分析、每日选股、每日复盘和 Workflow Run 四个来源入口，并显示侧栏今日任务数

## 4. AI 与验证

- [x] 4.1 新增只产出草稿的 AI 任务工具，验证 AI 无法自动创建、完成、取消或跨用户修改任务
- [x] 4.2 完成桌面/移动端、浅色/深色生产页面截图和键盘/触摸/reduced-motion 检查
- [x] 4.3 运行类型检查、lint、构建、服务端测试、数据库集成测试和 OpenSpec strict 校验，形成 `verification.md` 后归档
