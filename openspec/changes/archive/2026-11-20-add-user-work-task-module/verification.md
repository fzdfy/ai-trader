# Verification

日期：2026-11-20  
分支：`codex/user-work-task-module`

## 结果

- 迁移：`0038_separate_user_work_tasks` 与主键补迁移 `0039_rename_governance_review_task_pk` 已在本地 PostgreSQL 应用成功；治理任务表、事件表、索引和约束原地改名，个人任务及事件表创建成功。
- 服务端完整测试：`124` 通过、`0` 失败、`42` 个需显式数据库环境开关的测试跳过。
- 任务数据库测试：所有者隔离、生命周期事件、阻塞原因归档、自动排序、同列排序和 API CRUD/跨用户 404 全部通过。
- Web 测试：`46` 通过、`0` 失败。
- 类型检查：server / web 均通过。
- Lint：本次新增和修改文件 `0` warning、`0` error。
- 生产构建：Vite 构建通过。
- OpenSpec：`validate add-user-work-task-module --strict` 通过。
- 数据治理：`governance:check` 通过，注册表和生成目录与本地 Schema 一致。

## 验证命令

```text
node --env-file=../../.env.local --import @oxc-node/core/register --test "src/**/*.test.ts"
ADMIN_DB_TESTS=1 node --env-file=../../.env.local --import @oxc-node/core/register --test src/lib/work-tasks/service.test.ts
ADMIN_DB_TESTS=1 node --env-file=../../.env.local --import @oxc-node/core/register --test src/api/work-tasks.test.ts
ADMIN_DB_TESTS=1 node --env-file=../../.env.local --import @oxc-node/core/register --test src/lib/work-tasks/service.test.ts src/lib/data-governance/review-tasks.test.ts src/api/governance.test.ts src/db/governance-schema.integration.ts
node --test --experimental-strip-types
tsgo -b --noEmit
oxlint <changed files>
vite build
openspec validate add-user-work-task-module --strict
```

## 浏览器验收

生产页面使用真实登录会话、真实 PostgreSQL 数据与 `/api/v1/work-tasks`：

- [浅色桌面看板](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/light-desktop/page-浅色看板.png)
- [深色桌面看板](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/dark-desktop/page-深色看板.png)
- [浅色桌面详情](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/light-desktop-detail/page-浅色详情.png)
- [深色桌面详情](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/dark-desktop-detail/page-深色详情.png)
- [浅色移动端看板](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/light-mobile/page-移动端看板.png)
- [浅色移动端详情](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/light-mobile-detail/page-移动端详情.png)
- [鼠标跨列拖拽](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/light-desktop-drag/page-拖拽完成.png)
- [仅键盘拖拽](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/keyboard/page-键盘拖拽.png)
- [普通用户权限烟测](../../../docs/design/prototypes/explorations/screenshots/user-work-task-production/smoke/page-权限烟测.png)

截图工具确认：

- 无横向溢出。
- 无图片加载失败。
- 无未捕获控制台错误。
- 移动端表单输入字号为 `16px`，不会触发 iOS 自动放大。
- 详情面板底部操作按钮在移动端始终可见。
- `prefers-reduced-motion` 下关闭拖拽过渡。

初始截图发现普通用户会因每日看板无条件请求管理员同步模块而出现两个 `403`。已将该查询限制为 `super_admin`，最终权限烟测报告无控制台错误。

## 行为证据

- 鼠标从“待开始”拖到“已完成”后，数据库任务状态为 `completed`，事件链新增 `completed`。
- 仅用 Space / ArrowRight / Space 完成同一移动，截图显示任务进入“已完成”。
- 创建、读取、移动接口均由服务端 Session 用户执行；其他用户读取同一 ID 返回 `404`。
- AI 工具只返回白名单草稿字段，必须通过前端“打开任务草稿”再点击普通创建接口。

## 未覆盖

- 未在真实 iOS / Android 设备执行触屏手势；移动端状态按钮提供不依赖拖拽的等价路径。
- 未在 CI 的独立临时数据库执行破坏性回滚演练；迁移和事件完整性已在本地开发数据库验证。
