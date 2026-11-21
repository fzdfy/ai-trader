# docker-host-port-isolation Specification

## Purpose

定义 Docker 部署栈与宿主机本地开发并存的端口合同，确保宿主机端口不冲突且容器内部通信保持稳定。

## Requirements

### Requirement: Host ports are isolated from local development

Docker SHALL 使用独立宿主机端口，本地开发 SHALL 保留原有端口。

#### Scenario: Both stacks run together

- **WHEN** 本地 Vite、server、quant 和 PostgreSQL 使用 9080/3001/3002/5432
- **THEN** Docker MUST 使用 9180/3101/3102/5532
- **AND** 两套服务 MUST 能同时监听

### Requirement: Container-internal ports remain stable

端口偏移 SHALL 只作用于宿主机发布端口。

#### Scenario: Docker services communicate internally

- **WHEN** nginx 代理 API、server 访问数据库或 server 调用 quant
- **THEN** 内部目标 MUST 保持 `server:3001`、`postgres:5432` 和 `quant:3002`

### Requirement: Public HTTP tunnel follows the Docker Web port

zrok SHALL 指向 Docker Web 的实际宿主机端口。

#### Scenario: Public services are restarted

- **WHEN** Docker Web 改为 9180
- **THEN** zrok HTTP share MUST 指向 9180

### Requirement: Database is not shared through zrok

PostgreSQL SHALL 仅作为 Docker 和后端内部服务或本机开发数据库使用，不得通过 zrok 创建数据库 TCP share。

#### Scenario: zrok shares are configured

- **WHEN** 核对当前 zrok shares
- **THEN** MUST 只有 HTTP Web share
- **AND** MUST NOT 存在 PostgreSQL private TCP share

### Requirement: Local database clients use the Docker database port

宿主机本地开发连接 Docker PostgreSQL 时 SHALL 使用 5532。

#### Scenario: Local server starts against Docker database

- **WHEN** `.env.local` 用于连接 Docker PostgreSQL
- **THEN** `DATABASE_URL` MUST 使用 `localhost:5532`

### Requirement: Port configuration is overridable

Compose SHALL 为每个 Docker 发布端口提供环境变量和默认值。

#### Scenario: An operator changes a Docker port

- **WHEN** 设置对应的 `DOCKER_*_PORT` 环境变量
- **THEN** compose MUST 使用该值作为宿主机端口
- **AND** 容器内部端口 MUST 保持不变
