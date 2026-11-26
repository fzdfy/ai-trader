# Spec Delta

## MODIFIED Requirements

### Requirement: Environment selects one auth origin

系统 SHALL 在 Docker 部署中使用 `http://localhost:9180` 作为固定的
`BETTER_AUTH_URL`，并通过 `AUTH_TRUSTED_ORIGINS` 同时允许 localhost 与公网
Origin。

#### Scenario: Local development starts

- **WHEN** 使用仓库根目录的 `docker compose up` 启动 Docker 环境
- **THEN** server、worker 和 workflow-worker MUST 收到
  `BETTER_AUTH_URL=http://localhost:9180`
- **AND** server MUST 收到
  `AUTH_TRUSTED_ORIGINS=https://whtefvmqpezr.shares.zrok.io,http://localhost`

#### Scenario: Public deployment starts

- **WHEN** 公网流量经 `https://whtefvmqpezr.shares.zrok.io` 访问应用
- **THEN** `BETTER_AUTH_URL` MUST 保持 `http://localhost:9180`
- **AND** 公网 Origin MUST 由 `AUTH_TRUSTED_ORIGINS` 的精确 allowlist 接受
- **AND** 部署 MUST NOT 需要单独的 public compose overlay

## ADDED Requirements

### Requirement: Public overlay files are removed

系统 SHALL 只通过根目录 `docker-compose.yml` 配置 Docker 认证环境。

#### Scenario: Operator inspects deployment files

- **WHEN** 运维人员查看仓库部署入口和文档
- **THEN** 仓库 MUST NOT 提供 `deploy/setup-public.sh`
- **AND** MUST NOT 提供 `docker-compose.public.yml` 或 `.env.public.example`
- **AND** README 与架构文档 MUST NOT 引导创建 `.env.public`

