# Docker Host Port Isolation Design

## Intent

让同一台 Mac 可以同时运行本地 `pnpm dev` 和 Docker Compose 部署栈，避免宿主机端口冲突。Docker 只改变对外发布的宿主端口，容器内部端口与服务发现保持不变。

## Goals

- 本地开发继续使用 9080 / 3001 / 3002 / 5432。
- Docker 宿主端口使用 9180 / 3101 / 3102 / 5532。
- Docker 内部继续使用 nginx:80、server:3001、quant:3002、postgres:5432。
- zrok HTTP 入口改指向 9180。
- 数据库不通过 zrok 或其他公网隧道共享。
- 端口使用可覆盖环境变量，默认值即可完成本地与 Docker 并存。

## Non-Goals

- 不改变 Docker 容器内部端口、Dockerfile EXPOSE 或容器服务名。
- 不改变应用 API 路径、数据库 schema 或认证协议。
- 不允许 local 和 public 认证基准在同一 server 进程中自动切换。

## Port Contract

| 服务 | 本地开发 | Docker 宿主 |
|---|---:|---:|
| Web | 9080 | 9180 |
| Server | 3001 | 3101 |
| Quant | 3002 | 3102 |
| PostgreSQL | 5432 | 5532 |
| Loki | 3100 | 3200 |
| Alloy | 12345 | 12445 |
| Grafana | 3010 | 3110 |

## Configuration

Compose 使用逐项带默认值的变量，避免不可维护的端口算术：

- `DOCKER_WEB_PORT=9180`
- `DOCKER_SERVER_PORT=3101`
- `DOCKER_QUANT_PORT=3102`
- `DOCKER_POSTGRES_PORT=5532`
- `DOCKER_LOKI_PORT=3200`
- `DOCKER_ALLOY_PORT=12445`
- `DOCKER_GRAFANA_PORT=3110`

## Failure Modes

- zrok 未重启到新端口：公网入口不可用。
- 本地 `.env.local` 仍指向 5432：本地服务连到错误或未运行的数据库。
- 误改容器内部端口：nginx、worker 和 health check 将中断服务发现。
- 同时运行两个同 Compose project：固定 `container_name` 仍会冲突；本地 dev 应使用宿主机进程。
- 额外创建数据库 TCP share：会把 PostgreSQL 暴露到受控网络之外，当前明确禁止。

## Rollback

恢复各 Compose 发布端口、`.env.local` 数据库端口和 zrok 目标即可；无数据库迁移。

## Visual Design Impact

Visual design: not applicable. 本变更只调整端口、部署隧道和文档，不新增或修改可见 UI 布局、交互或状态。
