# Proposal

## Change Metadata

- type: bug
- risk: L2
- baseline: spec
- visual: not-applicable

## Why

当前公网部署依赖单独的 `.env.public`、`docker-compose.public.yml` 和
`deploy/setup-public.sh`，但 `BETTER_AUTH_URL` 随公网域名切换，导致同一套
服务在 localhost 与 zrok 访问之间切换时容易出现认证 Origin 不一致。现在需要在
单一 compose 配置中同时支持 `whtefvmqpezr.shares.zrok.io` 和 localhost。

## What Changes

- **BREAKING** 删除 `deploy/setup-public.sh`、`docker-compose.public.yml`、
  `.env.public.example` 和公网 overlay 部署流程。
- 将 server、worker、workflow-worker 的 `BETTER_AUTH_URL` 固定为
  `http://localhost:9180`。
- 为 server 固定
  `AUTH_TRUSTED_ORIGINS=https://whtefvmqpezr.shares.zrok.io,http://localhost`。
- 同步更新 README、架构文档和生成的 Web 知识内容，不再引导使用者创建或加载
  `.env.public`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-auth-origin`: 认证基准固定为 localhost，公网与 localhost 共用同一份精确
  Origin allowlist，不再要求公网 overlay。

## Acceptance Criteria

- **AC-1**：`docker-compose.yml` 中 server、worker、workflow-worker 的
  `BETTER_AUTH_URL` SHALL 固定为 `http://localhost:9180`。
- **AC-2**：server SHALL 使用
  `AUTH_TRUSTED_ORIGINS=https://whtefvmqpezr.shares.zrok.io,http://localhost`
  同时接受公网域名和本机回环来源。
- **AC-3**：仓库 SHALL NOT 再包含 `setup-public.sh`、public compose overlay 或
  `.env.public.example` 的生效说明与引用。
- **AC-4**：公网与 localhost 登录使用同一套 compose，未知 Origin SHALL NOT 被
  Better Auth 或 CORS 接受。

## Impact

- 配置：`docker-compose.yml`、`.gitignore`、`.dockerignore`、`deploy/setup.sh`。
- 文档：README、`docs/architecture.md`、生成的前端知识索引。
- 数据与 API：无数据库迁移、无业务 API 或前端交互变化。
- 风险：认证与 Origin allowlist 属于 L2 安全边界，需要配置验证、定向认证测试和
  最终完整校验。

## Visual Design Impact

Visual design: not applicable.

本变更只调整容器认证环境、部署文件和文档，不新增或修改页面、组件、可见状态、
交互或响应式行为。
