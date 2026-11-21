# Verification

## 环境

- 日期：2026-11-21
- 公网入口：`https://ouzq6euvec18.shares.zrok.io`
- 本地基础环境：`.env.local`
- 公网覆盖环境：`.env.public`
- 公网启动配置：`docker-compose.yml` + `docker-compose.public.yml`
- 视觉设计：not applicable；无可见 UI 变化

## 自动化验证

| 检查 | 结果 |
|---|---|
| Origin、Better Auth、CORS 针对性测试 | 8/8 通过 |
| Server 全量测试 | 174 项：132 通过、42 跳过、0 失败 |
| Server 类型检查 | 通过 |
| Server lint | 0 error、18 warning |
| 变更文件格式检查 | 通过 |
| nginx 镜像构建 | 通过 |
| Web 生产构建（nginx 构建阶段） | 通过；仍有既有大 chunk warning |

针对性测试命令：

```bash
node --env-file=../../.env.local --import @oxc-node/core/register \
  --test src/lib/auth-origins.test.ts src/auth/index.test.ts src/lib/cors.test.ts
```

全量测试命令：

```bash
node --env-file=../../.env.local --import @oxc-node/core/register \
  --test "src/**/*.test.ts"
```

跳过项使用现有 `ADMIN_DB_TESTS` / `WORKFLOW_DB_TESTS` 门禁，未在本次验证中开启。Lint 的 18 个 warning 均为 server 既有未使用导入或数组构造提示，本次变更文件未新增 warning。

## 本地环境验证

- `docker compose config` 成功。
- server、worker、workflow-worker 的 `BETTER_AUTH_URL` 均为 `http://localhost:9080`。
- 临时 server 容器实际输出：

```text
server BETTER_AUTH_URL=http://localhost:9080
server AUTH_TRUSTED_ORIGINS=
```

本地继续使用 `.env.local` 和 `docker compose up -d`，认证 Origin 回退到默认本地地址。

## 公网环境验证

公网 compose 配置成功解析，server 实际得到：

```text
server BETTER_AUTH_URL=https://ouzq6euvec18.shares.zrok.io
server AUTH_TRUSTED_ORIGINS=https://ouzq6euvec18.shares.zrok.io
```

缺少 `AUTH_TRUSTED_ORIGINS` 时 compose 拒绝启动，避免公网环境静默回退 localhost。

已使用公网 overlay 重建并启动 server/nginx，运行中容器环境变量与上述值一致。

### 公网接口

| 请求 | 结果 |
|---|---|
| `GET /health` | HTTP 200，返回 `{"status":"ok",...}` |
| `/api/v1/system/me`，可信 Origin | HTTP 401（未登录），返回 `Access-Control-Allow-Origin: https://ouzq6euvec18.shares.zrok.io` |
| `/api/v1/system/me`，未知 Origin | HTTP 401（未登录），不返回 `Access-Control-Allow-Origin` |

nginx 运行配置包含：

- `server_name _`
- `X-Forwarded-Host $host`
- `X-Forwarded-Proto $forwarded_proto`
- `map $http_x_forwarded_proto $forwarded_proto`，请求头缺失时才回退本地 `$scheme`

## 未覆盖项

- 未通过真实浏览器完成登录、Cookie 写入和跨刷新会话保持验收；需要用户使用 zrok 地址实际登录确认。
- 本次验证确认 nginx 最终配置传递 `X-Forwarded-Proto`，但没有新增用于回显请求头的诊断接口，因此未在 server 响应中直接展示该请求头。
- 42 个需要显式数据库测试开关的集成测试保持跳过，未扩大本次变更测试范围。

## 结论

全部 `tasks.md` 实施项已完成。公网 Origin、Better Auth、CORS、本地/公网环境隔离和 nginx 转发配置均有自动化或运行时证据；归档仍需单独确认。
