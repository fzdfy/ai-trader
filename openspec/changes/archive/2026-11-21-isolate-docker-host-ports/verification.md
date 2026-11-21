# Verification

## 环境

- 日期：2026-11-21
- 本地开发端口：9080 / 3001 / 3002 / 5432
- Docker 宿主端口：9180 / 3101 / 3102 / 5532 / 3200 / 12445 / 3110
- Docker 内部端口：80 / 3001 / 3002 / 5432 / 3100 / 12345 / 3000
- 公网 HTTP：`https://whtefvmqpezr.shares.zrok.io`
- Visual design: not applicable

## 端口验证

`docker compose config` 和运行中容器均确认：

| 服务 | 宿主 | 容器 |
|---|---:|---:|
| nginx | 9180 | 80 |
| server | 3101 | 3001 |
| quant | 3102 | 3002 |
| postgres | 5532 | 5432 |
| Loki | 3200 | 3100 |
| Alloy | 12445 | 12345 |
| Grafana | 3110 | 3000 |

本地开发端口检查：

```text
9080 FREE
3001 FREE
3002 FREE
5432 FREE
```

PostgreSQL 容器内部健康检查通过：

```text
/var/run/postgresql:5432 - accepting connections
```

## 自动化验证

| 检查 | 结果 |
|---|---|
| 认证与 CORS 针对性测试 | 8/8 通过 |
| Server 全量测试 | 174 项：132 通过、42 跳过、0 失败 |
| Server 类型检查 | 通过 |
| Server lint | 0 error、18 个既有 warning |
| 变更文件格式检查 | 通过 |
| Web 生产构建 | 通过；仍有既有大 chunk warning |

Server 测试通过 `.env.local` 连接新的 Docker PostgreSQL 宿主端口 5532。

## 运行态验证

- Docker 本地入口 `http://127.0.0.1:9180/health` 返回 HTTP 200。
- zrok HTTP share 目标为 `http://127.0.0.1:9180`。
- zrok 当前只有 HTTP Web share，不存在 PostgreSQL TCP share。
- 公网 `/health` 返回 HTTP 200。
- 公网可信 Origin 返回匹配的 `Access-Control-Allow-Origin`。
- 未知 Origin 不返回 `Access-Control-Allow-Origin`。
- Docker 本地 `http://localhost:9180` 已加入精确 allowlist；错误凭据登录返回 401，不再返回 Origin 403。

## 未覆盖项

- 8080/9080 等 localhost 端口共享 Cookie 的浏览器行为未做双栈登录并发验收。
- 42 个显式数据库测试开关控制的集成测试保持跳过。

## 结论

本地开发端口与 Docker 宿主端口已隔离，容器内部通信和公网入口均已验证。变更可以进入审查与归档流程。
