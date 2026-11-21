# Proposal

## Why

本地开发进程与 Docker 部署栈当前竞争同一组宿主机端口，无法同时运行。需要在保持容器内部通信不变的前提下，为 Docker 发布端口建立稳定偏移。

## Product Requirements

### Users

- 本地开发者：同时在宿主机运行 Vite、server 和 quant。
- 运维人员：保持 Docker 栈和 zrok HTTP 入口持续可用。

### Goals

- Docker 宿主机端口默认整体 +100。
- 容器内部端口和 Docker 服务名不变。
- zrok、本地数据库连接、部署脚本和文档同步更新。

### Non-Goals

- 不修改应用业务接口、数据库 schema 或容器网络拓扑。
- 不引入自动端口算术或动态发现服务。

### Acceptance Criteria

- 本地 9080/3001/3002/5432 与 Docker 9180/3101/3102/5532 可并存。
- nginx 仍代理 `server:3001`，server 仍访问 `postgres:5432` 和 `quant:3002`。
- zrok HTTP share 指向 9180。
- 数据库不通过 zrok TCP share 对外共享。
- 文档、脚本和本地 `.env.local` 与实际端口一致。

## What Changes

- 更新 Compose 发布端口和认证本地默认 Origin。
- 更新本地数据库连接和 zrok HTTP 目标。
- 更新部署脚本、文档和生成知识。
- 重建并验证 Docker 栈、公网入口和数据库连通性。

## Capabilities

### New Capabilities

- `docker-host-port-isolation`: Docker 与本地开发并存的宿主机端口合同。

## Impact

- Deployment：Compose、zrok、脚本、文档。
- Local development：`.env.local` 数据库端口。
- Server：Docker 本地认证默认 URL。
- Database：无 schema 或数据迁移。

## Visual Design Impact

Visual design: not applicable. 端口和部署地址变化不修改页面、组件、交互或可见状态。
