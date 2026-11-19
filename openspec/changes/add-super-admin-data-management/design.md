# Design

完整技术方案见 `docs/superpowers/specs/2026-11-19-super-admin-data-management-design.md`。

## Context

现有数据中心已经维护表、来源、同步策略、回补、降级和运行记录；同步中心已经展示模块状态和记录。缺口是角色、服务端授权、统一入口、数据质量和受控操作审计。

## Goals / Non-Goals

**Goals:**

- 复用现有工作台、数据中心和同步引擎。
- 数据源配置继续以代码注册表和环境变量为事实源。
- 超级管理员统一查看数据源、数据表、同步和质量。
- 普通用户保留非敏感聚合数据状态。
- 一期开放手动同步和单模块重试，所有动作可审计。

**Non-Goals:**

- 独立后台应用、原始数据行浏览、任意 SQL。
- 在线修改 Provider 凭据、地址和限流。
- 一期开放历史回补、重建、暂停调度和删除。

## Decisions

### Embedded console over separate admin app

采用现有工作台内 `/home/data-management`，复用认证、主题、导航和 Preline 组件。独立后台会重复现有能力，且增加部署与权限面。

### Database role plus server allowlist bootstrap

角色保存为 `user.role`，首期仅 `user | super_admin`。`SUPER_ADMIN_EMAILS` 只在服务端引导指定邮箱成为超级管理员；客户端不能提交角色，移出白名单不会静默降级数据库角色。

### Code registry over editable metadata

数据源、表、同步策略和降级关系继续来自代码注册表；后台只叠加数据库运行时状态和 quant health。避免后台、代码、文档三套口径。

### Controlled operations over database CRUD

一期仅允许手动同步和单模块失败重试。不提供原始数据行、任意 SQL、凭据编辑、历史回补或重建。

### Public aggregate status

普通用户通过新的轻量 `GET /api/v1/system/data-status` 获取在线状态、最近更新和同步中状态，不调用详细同步接口。

## API Boundary

```text
GET  /api/v1/system/data-status
GET  /api/v1/data-management/sources
GET  /api/v1/data-management/tables
GET  /api/v1/data-management/tables/:table
GET  /api/v1/data-management/sync/modules
GET  /api/v1/data-management/sync/records
GET  /api/v1/data-management/quality
GET  /api/v1/data-management/audit
POST /api/v1/data-management/sync/run
POST /api/v1/data-management/sync/modules/:jobType/retry
```

## UI Boundary

- `super_admin`：系统入口显示“数据管理”和“主题设置”。
- `user`：系统入口只显示“主题设置”。
- 数据管理包含数据源、数据表、数据同步、数据质量和操作记录。
- 旧 `/home/sync`、`/home/data-center` 作为兼容 URL 重定向到新页面。

## Data Model

- `user.role`：`user | super_admin`，默认 `user`。
- `admin_operation_audit`：操作人、动作、目标模块、原因、请求 ID、任务 ID、状态、参数、结果、错误和时间。

## Risks / Trade-offs

- 现有同步 API 未鉴权 → 先完成服务端权限中间件，再开放菜单。
- 无角色用户迁移 → 默认 `user`，超级管理员由服务端白名单引导。
- 重试模块与手动同步写同一表 → 沿用现有互斥检查，并在动作层再校验。
- 精确行数可能拖慢大表 → 首期不展示精确行数，使用最新数据时间和运行记录判断质量。
- 超级管理员入口被角色加载延迟影响 → 未加载角色时按最小权限隐藏。

## Migration Plan

1. 添加角色字段和审计表。
2. 引导超级管理员并完成服务端授权。
3. 增加聚合数据状态接口。
4. 将数据中心和同步中心拆分为超级管理员读接口与受控动作。
5. 增加数据管理页面和角色化导航。
6. 验证普通用户、超级管理员、并发冲突、失败重试和审计。

## Review Result

- **Status**: approved
- **Reviewer**: Codex self-review as builder
- **Blocking issues**: none
- **Residual risk**: 现网同步接口尚未鉴权，实施时必须先完成服务端授权
