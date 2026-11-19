# 后端工程标准

## 基线

- Hono、PostgreSQL、Drizzle ORM、Zod、Better Auth、Pino。
- API 前缀 `/api/v1`，认证前缀 `/api/auth`。
- 统一响应 `{ success, data }` 或 `{ success, error }`。

## 路由与输入

- 路由保持薄层，外部服务与数据库细节放 `lib` 或服务层。
- Body、Query、Path、Header、上传文件必须有运行时校验。
- 状态码：400 参数、401 未登录、403 无权、404 不存在/隐藏、409 冲突、429 限流、500 内部错误。
- 未捕获异常由统一 `onError` 返回稳定 JSON。

## 数据库

- 全进程共享一个连接池。
- 用户资源必须有 owner 字段和数据库约束。
- 多表写入与不可分割状态流使用事务。
- 幂等写入使用 `ON CONFLICT`。
- 迁移由 Drizzle Kit 生成，不修改已执行迁移。

## Auth 与授权

- 身份来自 Better Auth 服务端 Session。
- 不得信任客户端 `X-User-Id`、`X-Role` 等身份头。
- 用户资源查询、修改、删除必须在服务端校验 owner。
- 私有资源读取可返回 404 降低枚举风险。
- Cookie 使用 HttpOnly、生产 Secure、SameSite=Lax。
- CORS 使用固定 allowlist，不反射任意 Origin。
- Agent 线程资源必须绑定真实用户。

## 外部服务、Worker 与日志

- 外部 HTTP 必须设置超时和取消；只重试瞬时错误。
- Worker 独立进程运行，防重入，有 deadline 和持久化状态。
- 全链路透传 `request_id`；Worker 额外带 `job_run_id`。
- 不记录密码、Cookie、Session Token、OAuth Token 或 API Key。

## 验证

- Server 纯逻辑与契约测试：`npm test`（在 `apps/server`）。
- 工作流数据库与服务集成测试：`WORKFLOW_DB_TESTS=1 npm run test:db`（使用专用 `*workflow_check` 数据库）。
- Web 测试：`npm test`（在 `apps/web`）。
