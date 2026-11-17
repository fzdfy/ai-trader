# Monorepo 与架构标准

## 工作区

- 包管理器：pnpm workspace，使用最新稳定版并通过 `packageManager` 精确锁定（当前 `pnpm@11.25.0`）。
- Node.js：使用当前最新 LTS 版本（当前 `>=26`），CI、本地和容器保持一致。
- 运行时：Node.js 26。
- 任务编排：Turbo。
- 可运行应用放在 `apps/*`，跨应用能力放在 `packages/*`。
- JavaScript/TypeScript 质量检查统一使用 oxlint + `tsgo`，不得新增其他 lint 工具或规则配置。

## 依赖方向

- `apps` 可以依赖 `packages`。
- `packages` 不得反向依赖具体应用。
- 内部包使用 `@ai-trader/*` 和 `workspace:*`。
- 公共 TypeScript、lint、构建配置下沉到共享包。

## 任务与质量

- `dev`、`start` 是持续运行任务，不缓存。
- `build` 依赖上游构建并声明产物。
- `check-types` 统一运行类型检查。
- 提交前至少运行 `pnpm check-types`、`pnpm lint` 和受影响应用的构建。
- Python 服务没有统一 lint/type-check 命令，必须单独验证。

## 文档与变更

- 长期工程事实写入 `docs/`。
- 系统行为规格写入 `openspec/specs/`。
- 单次变更写入 `openspec/changes/<change>/`，`tasks.md` 是唯一实施清单。
- 跨模块、难回滚、存在真实取舍的决策写入 `docs/adr/`。

## 架构边界

- Web、Server、Quant、PostgreSQL 与日志栈保持进程边界。
- 跨模块通过 API、数据库契约或共享包协作，不读取其他应用内部文件。
- 数据源、回测读取和前端实现分别受 [database.md](./database.md)、[backend.md](./backend.md)、[frontend.md](./frontend.md) 约束。
