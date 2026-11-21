# Proposal

## Why

应用通过 zrok 暴露后，公网浏览器 Origin 与当前硬编码的 localhost/旧域名不一致。Better Auth 受信任 Origin 和 CORS 必须安全地跟随部署环境变化，同时保持本地开发不变。

## Product Requirements

### Users

- 本地开发者：继续使用现有 `.env.local` 和默认 compose 命令。
- 运维人员：通过公网环境文件部署 zrok 地址，不需要修改应用代码。

### Goals

- 将本地和公网认证配置分离为两套互斥环境。
- Better Auth 和 CORS 共用精确 Origin allowlist。
- zrok 地址变化只需修改环境文件并重新创建 server。

### Non-Goals

- 不在同一 server 进程内同时支持两个 Better Auth 基准地址。
- 不信任整个 `*.shares.zrok.io` 域名。
- 不修改页面、交互或可见文案。

### Acceptance Criteria

- `.env.local` 内容和本地启动命令保持不变。
- 公网 overlay 使用 `.env.public` 中的 `BETTER_AUTH_URL` 与 `AUTH_TRUSTED_ORIGINS`。
- 公网 Origin 可通过 CORS；任意未登记 Origin 不获得 CORS 许可。
- Better Auth 使用同一 allowlist。
- zrok 更新域名后只需修改 `.env.public` 并重新创建 server，不修改代码或重建前端。

## What Changes

- 新增环境 Origin 解析与 allowlist 单元测试。
- Better Auth 和 Hono CORS 接入同一配置。
- 新增公网 compose overlay 和环境模板。
- nginx 保留公网 HTTPS 协议与 Host。
- 更新部署文档和验证报告。

## Capabilities

### New Capabilities

- `public-auth-origin`: 环境选择的公网认证基准、精确 Origin allowlist 和代理协议传递。

## Impact

- Server：认证配置、CORS 和启动参数解析。
- Deployment：`.env.public`、compose overlay、nginx 和文档。
- Web：无代码变化，继续使用同源 `/api` 与 `/api/auth`。
- Database：无 schema 或数据变更。

## Visual Design Impact

Visual design: not applicable. 本变更只修改后端认证、CORS、环境变量和反向代理配置，没有可见 UI 行为变化。
