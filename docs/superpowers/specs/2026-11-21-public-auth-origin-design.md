# Public Auth Origin Configuration Design

## Intent

通过 zrok 暴露应用时，浏览器访问的是动态公网 Origin，而 Better Auth、CORS 和反向代理当前只识别本地地址或硬编码域名。目标是让本地开发保持原样，公网地址由独立环境配置提供，未来更换 zrok 地址时不修改应用代码。

## Goals

- `.env.local` 和 `docker compose up -d` 的本地行为保持不变。
- 公网环境使用独立 `.env.public` 覆盖认证地址和受信任 Origin。
- Better Auth 与 Hono CORS 使用同一份精确 Origin allowlist。
- zrok 终止 TLS 后，nginx 向 server 传递原始 HTTPS 协议和 Host。
- 公网地址变化只修改环境文件并重建 server 容器，不重新构建前端或修改业务代码。

## Non-Goals

- 不支持 local 与 public 两个认证基准地址在同一 server 进程内自动切换。
- 不信任 `*.shares.zrok.io` 通配 Origin。
- 不引入 OAuth 回调、跨子域 Cookie 或新的身份认证方式。
- 不修改可见 UI。

## Approaches

### A. 两套完整 `.env` 文件（选择）

保留 `.env.local` 作为本地基础环境；新增 `.env.public` 和 `docker-compose.public.yml` 覆盖 server 的 `BETTER_AUTH_URL` 与 `AUTH_TRUSTED_ORIGINS`。本地命令不变，公网命令显式选择 overlay。

优点是认证基准唯一、秘密配置不重复、切换明确。代价是公网启动命令比本地多两个参数。

### B. 同一文件中同时保存 local/public 变量

代码或 compose 根据 `APP_ENV` 选择变量。配置集中，但同一进程存在两个认证地址概念，误用风险高，因此不采用。

### C. Better Auth 动态基址与 zrok 通配符

按请求 Host 动态生成 baseURL，并允许 `*.shares.zrok.io`。地址变化无需改配置，但会把大量第三方可控 Host 纳入认证信任面，因此不采用。

## Design

### Configuration

- `.env.local`：保持当前内容，不修改。
- `.env.public`：仅保存 `BETTER_AUTH_URL` 和 `AUTH_TRUSTED_ORIGINS`，实际文件不提交。
- `.env.public.example`：保存当前 zrok 地址作为模板。
- `docker-compose.public.yml`：只覆盖 server 的公网认证变量，并继续复用 `.env.local` 中的数据库和密钥。

公网启动：

```bash
docker compose --env-file .env.public \
  -f docker-compose.yml \
  -f docker-compose.public.yml \
  up -d
```

本地启动保持：

```bash
docker compose up -d
```

### Origin rules

新增纯函数模块解析 `AUTH_TRUSTED_ORIGINS`：

- 按逗号拆分，去除空白和末尾斜杠。
- 仅接受合法的 `http` / `https` Origin。
- 去重并保持输入顺序。
- 未配置时回退到 `BETTER_AUTH_URL` 和 `http://localhost:9080`。

Better Auth 将该结果作为 `trustedOrigins`，Hono CORS 只返回该集合内的 Origin。无 Origin 的非浏览器请求不受影响，未命中 Origin 不返回 CORS 许可。

### Proxy protocol

nginx 使用 `server_name _`，并通过 `map` 保留 zrok 传来的 `X-Forwarded-Proto`；缺失时回退到 nginx 当前 `$scheme`。同时传递 `X-Forwarded-Host`，使 Better Auth 的请求上下文与公网一致。

### Future domain changes

zrok 地址变化时只修改 `.env.public` 中的两个值并重新创建 server。若需要完全不修改配置，应使用稳定自有域名或 zrok reserved share。

## Failure Modes

- `.env.public` 缺失或变量为空：公网 overlay 启动失败，避免悄悄使用 localhost。
- Origin 配置包含非法 URL：server 启动时失败，避免生成不可预测的 allowlist。
- 浏览器 Origin 不在 allowlist：不返回 CORS 许可，Better Auth 拒绝不可信请求。
- zrok 未传 `X-Forwarded-Proto`：nginx 回退到内网 HTTP；`BETTER_AUTH_URL=https://...` 仍提供认证安全基准。
- 新域名切换后：旧域名 Cookie 不迁移，用户需要重新登录。

## Compatibility and Rollback

- 本地 `.env.local`、本地启动命令和现有前端相对 API 路径不变。
- 公网模式通过附加 compose 文件启用，回滚时删除 overlay 文件并以普通 compose 重建即可。
- 不修改数据库 schema 或业务数据。

## Visual Design Impact

Visual design: not applicable. 本变更只调整环境变量、认证 Origin、CORS 和反向代理协议，不新增或修改页面、组件、可见状态、交互、响应式或主题行为。

## Review Result

- **Status**: approved
- **Reviewer**: user confirmation + Codex self-review
- **Date**: 2026-11-21
- **Blocking issues**: none
- **Residual risk**: 同时从 localhost 与公网访问同一 server 时只能有一个认证基准地址；该场景不在本次支持范围。
