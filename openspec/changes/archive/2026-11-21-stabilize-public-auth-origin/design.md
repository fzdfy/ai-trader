# Design

完整方案见 `docs/superpowers/specs/2026-11-21-public-auth-origin-design.md`。

## Context

当前 `.env.local` 提供本地环境，compose 又硬编码覆盖 server 的 `BETTER_AUTH_URL`；Better Auth 受信任 Origin 写死 localhost 和旧域名；Hono CORS 反射任意 Origin；nginx 把 zrok 的 HTTPS 覆盖成内部 HTTP。

## Decisions

### Two environment profiles

保留 `.env.local`，新增 `.env.public` 与 `docker-compose.public.yml`。本地默认 compose 命令不变，公网通过显式 `--env-file` 和 `-f` 选择。一个 server 进程始终只获得一个认证基准地址。

### Shared exact allowlist

新增纯函数解析 `AUTH_TRUSTED_ORIGINS`。Better Auth 与 CORS 同时消费结果，默认仅包含 `BETTER_AUTH_URL` 和 `http://localhost:9080`。不接受任意 Origin 反射，也不使用 zrok 通配符。

### Reverse proxy forwarding

nginx 使用默认 server 名，保留上游 `X-Forwarded-Proto`，缺失时使用本地 scheme，并补充 `X-Forwarded-Host`。

## API and Configuration Boundary

```text
BETTER_AUTH_URL=https://<public-origin>
AUTH_TRUSTED_ORIGINS=https://<public-origin>[,http://localhost:9080]
```

公网启动：

```bash
docker compose --env-file .env.public \
  -f docker-compose.yml \
  -f docker-compose.public.yml \
  up -d
```

## Risks / Trade-offs

- 双命令模式比单命令多一步显式环境选择，但避免认证基址歧义。
- localhost 与公网不能共享同一个认证基准的 Cookie；切换域名需要重新登录。
- 若 zrok 不传 `X-Forwarded-Proto`，nginx 只能回退到内网 HTTP；HTTPS 认证 URL 仍是安全基准。
- 不信任 zrok 通配域名，避免扩大带凭据请求的 Origin 面。

## Migration Plan

1. 增加 Origin 纯函数和测试。
2. 接入 Better Auth 与 CORS。
3. 移除 compose 的本地认证硬编码，增加公网 overlay。
4. 修正 nginx 转发协议。
5. 更新部署文档并执行单元、类型、lint、compose 与公网接口验证。

## Review Result

- **Status**: approved
- **Reviewer**: user confirmation + Codex self-review
- **Date**: 2026-11-21
- **Blocking issues**: none
- **Residual risk**: local 与 public 不能在同一 server 进程中同时拥有各自的认证基准。
