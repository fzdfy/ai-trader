# 超级管理员数据管理设计

## Intent

把数据源、数据表、同步任务、数据质量、故障和受控运维动作收束到一个超级管理员工作区。稳定知识继续保存在文档，实时状态和操作放在现有工作台内，不建设独立后台应用。

## Goals

- 统计口径与数据血缘可追溯：来源 → 同步任务 → 数据表 → 下游场景。
- 超级管理员从一个入口查看数据源、表、同步和质量状态。
- 普通用户仍能看到不敏感的数据新鲜度摘要。
- 一期开放手动同步和单模块失败重试，并记录审计。
- 数据源、限流、降级和凭据继续由代码注册表与环境变量管理。

## Non-Goals

- 任意 SQL、原始数据行浏览、在线编辑业务表。
- 在线修改 Provider 地址、凭据、限流或熔断参数。
- 首期开放历史回补、派生数据重建、暂停调度、删除任务。
- 新服务、新数据库或独立 Admin SPA。

## Approaches

### A. 文档 + 现有工作台内的超级管理员控制台（选择）

保留 `docs/data-pipeline.md` 作为稳定数据契约；新增角色权限和单一“数据管理”入口；复用现有数据中心注册表和同步执行器，补充质量、审计和受控动作。

优点：事实源清晰、复用最多、权限可在页面和 API 同时约束。代价：需要补角色、API 授权、审计和导航改造。

### B. 只维护文档（拒绝）

文档适合稳定口径，但无法展示实时熔断、任务进度、最新数据日期和失败原因，也无法安全执行同步。

### C. 独立后台应用（拒绝）

会重复导航、认证、设计系统和现有数据中心/同步中心，增加部署面；当前能力规模不足以支撑第二个前端。

## Information Architecture

```text
系统
├── 数据管理                    # super_admin only
│   ├── 数据源
│   ├── 数据表
│   ├── 数据同步               # 原同步中心
│   ├── 数据质量
│   └── 操作记录
└── 主题设置                    # all users
```

现有 `/home/sync` 和 `/home/data-center` 保留为兼容深链接，重定向到 `/home/data-management/sync` 和 `/home/data-management/tables`。普通用户访问时返回无权限或回工作台。

## Roles And Access

| 能力 | `user` | `super_admin` |
|---|---:|---:|
| 主题设置 | 允许 | 允许 |
| 聚合数据在线状态 | 允许 | 允许 |
| 数据源、表、同步详情 | 拒绝 | 允许 |
| 手动同步、单模块重试 | 拒绝 | 允许 |
| 操作审计查看 | 拒绝 | 允许 |

首期不新增 `admin` 角色。角色保存在数据库，`SUPER_ADMIN_EMAILS` 仅用于服务端引导指定邮箱成为 `super_admin`，不在客户端暴露，也不会在邮箱移出白名单时静默降级现有账户。

## Data Model

### `user.role`

- `text NOT NULL DEFAULT 'user'`
- 约束值：`user | super_admin`
- 角色由服务端读取，前端不能提交角色字段。

### `admin_operation_audit`

```text
id
actor_user_id
action                 sync_run | sync_retry
target_job_type         retry 时为具体模块
reason
request_id
job_run_id
status                  accepted | running | success | failed | interrupted
input_json
result_json
error
created_at
finished_at
```

索引：`(created_at desc)`、`(actor_user_id, created_at desc)`、`(status)`。

审计行只允许写入和状态收敛，不提供应用层删除或修改输入参数的接口。

## API Boundary

### Public authenticated status

```text
GET /api/v1/system/data-status
```

仅返回 `updatedAt`、`running`、`available` 等聚合状态，不返回 Provider、表名、错误和熔断详情。

### Super-admin read APIs

```text
GET /api/v1/data-management/sources
GET /api/v1/data-management/tables
GET /api/v1/data-management/tables/:table
GET /api/v1/data-management/sync/modules
GET /api/v1/data-management/sync/records
GET /api/v1/data-management/quality
GET /api/v1/data-management/audit
```

底层继续复用现有 data-center、sync 和 quant source-health 服务；不建立第二份表元数据。

### Super-admin actions

```text
POST /api/v1/data-management/sync/run
POST /api/v1/data-management/sync/modules/:jobType/retry
```

所有动作要求登录、`super_admin`、确认参数、并发检查和审计。

## Data Source Registry

代码注册表继续作为事实源：

- Provider 与能力：`apps/quant/data/registry.py` 和 `/api/v1/data/sources`.
- 表、来源、同步策略、依赖、回补、降级链和风控：`DATA_CENTER_TABLES`.
- 运行时健康、熔断和当前生效源：quant `/sources/health`.

数据源页面按 Provider 聚合 `DATA_CENTER_TABLES[*].sources`，并叠加运行时状态。注册表新增表或来源时，数据管理页面自动出现，不维护第二份数据库元数据。

## Data Quality

一期质量视图使用现有可用信号：

- `dataGap`：未解决断档。
- `job_run`：失败、运行超时、部分写入和最近成功时间。
- 表业务时间：K 线取 `MAX(time)`，快照取 `MAX(updated_at)`。
- `syncPolicy`：预期调度、Deadline 和依赖。
- Provider health：熔断、降级和当前生效源。

每个数据表定义可选的 `freshnessSlaHours`，由代码注册表维护。超过 SLA 显示陈旧，不按自然日猜测数据是否最新。

不提供原始行查询。首期不显示精确行数，避免对千万级分区表做全量 `COUNT(*)`。

## Sync Semantics

手动同步复用 `runManualSync`。单模块重试复用 `RUNNERS` 注册表，仅允许 `enabled` 且当前失败或从未成功的模块。

重试前检查：

- 动作人是 `super_admin`。
- 模块存在且允许重试。
- 与手动同步或其他运行中模块没有写冲突。
- 前置依赖今日成功，或不要求依赖。
- 必须提交原因。

高风险的历史回补、重建、暂停和删除在一期由 API 明确拒绝，不显示可点击操作。

## Navigation

- `super_admin`：底部系统入口显示“数据管理”和“主题设置”。
- `user`：底部系统入口只显示“主题设置”。
- 角色尚未加载时按最小权限隐藏“数据管理”，避免闪现。
- 普通用户仍通过 `/api/v1/system/data-status` 看到数据在线状态和最近更新时间。

## Security

- 所有数据管理 API 在服务端校验 session 和数据库角色。
- 直接 URL 与 API 均拒绝普通用户，不仅隐藏菜单。
- 白名单邮箱只在服务端读取。
- 审计和同步接口不信任客户端提交的角色、任务状态或范围。
- 错误响应不回传 Provider 凭据或完整原始异常。

## Migration And Rollout

1. 添加 `user.role` 与新用户默认值，迁移现有用户为 `user`。
2. 从 `SUPER_ADMIN_EMAILS` 引导超级管理员并验证。
3. 新增审计表和服务端权限中间件。
4. 将现有同步中心、数据中心 API 纳入超级管理员授权。
5. 增加普通用户聚合数据状态 API，替换导航栏对详细同步接口的依赖。
6. 新增数据管理页面并复用现有组件。
7. 接入手动同步和单模块重试动作。
8. 验证普通用户菜单、直接 URL、API、键盘和移动端。

回滚时先关闭数据管理导航和动作 API，保留只读数据表与审计记录；角色列可保持兼容，不删除审计数据。

## Verification Focus

- 普通用户加载、刷新、切换主题后仍只看到主题设置。
- 直接访问旧/新数据管理 URL 和 API 均不能看到敏感信息。
- 超级管理员看到单一数据管理入口和全部子页面。
- 任一表可以追溯到来源、同步任务、依赖和最新数据时间。
- 同时触发与已有任务冲突时被阻止。
- 手动同步和重试成功、失败都能形成完整审计链。
- 数据源熔断、数据断档、任务失败、部分写入和陈旧数据均有明确状态。
- 移动端、深色模式和键盘焦点不出现回归。

## Review Result

- Review status: `approved`
- Technical reviewer: Codex self-review as builder
- User decision coverage: approved role split, access boundary, source-of-truth policy, phase-one action scope
- Blocking issues: none
- Residual risk: current API routes are not authenticated and must be fixed before enabling the menu
