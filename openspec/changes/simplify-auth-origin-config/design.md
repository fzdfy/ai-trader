# Design

## Context

见 [proposal.md](./proposal.md) 的 Why。当前认证配置由根 compose、public
overlay 和 `.env.public` 共同决定；`BETTER_AUTH_URL` 会随公网域名覆盖而变化。
`apps/server` 已通过 `parseTrustedOrigins` 将 Better Auth 和 CORS 统一到同一
精确 allowlist，并额外允许任意端口的 HTTP 本机回环来源。

## Goals / Non-Goals

**Goals:**

- 用一套 compose 同时服务 localhost 与当前 zrok 公网地址。
- 删除公网专用脚本、overlay 和 env 模板，减少认证环境漂移。
- 保留 Better Auth 与 CORS 对未知 Origin 的拒绝行为。

**Non-Goals:**

- 不修改登录页面、业务 API、数据库或 Worker 逻辑。
- 不引入动态域名发现、通配 Origin 或局域网访问。

## Decisions

### 固定认证基准地址

server、worker、workflow-worker 均固定
`BETTER_AUTH_URL=http://localhost:9180`。这样本地与公网访问共享同一服务端认证
基准，公网入口只通过可信 Origin allowlist 放行。

替代方案是继续通过 `.env.public` 覆盖公网地址，但会保留两个部署命令和两套
故障模式，不满足本次简化目标。

### 单 compose 的显式 Origin allowlist

server 的环境变量固定为：

```text
AUTH_TRUSTED_ORIGINS=https://whtefvmqpezr.shares.zrok.io,http://localhost
```

Web 实际使用的 `http://localhost:9180` 由 `parseTrustedOrigins` 已有的本机
回环端口规则接受；公网域名继续走精确匹配。未知域名和局域网地址仍被拒绝。

### 删除 public overlay

移除 `deploy/setup-public.sh`、`docker-compose.public.yml`、`.env.public.example`
和现有忽略项。README 与架构文档改为单一 `docker compose up -d` 部署说明。

已完成的历史 OpenSpec/方案文档保留为历史记录，不作为当前部署入口。

## Risks / Trade-offs

- 公网域名变化需要修改根 compose 并重建 server，而不是只改被忽略的 env 文件 →
  在 README 和架构文档中明确当前域名与修改位置。
- `BETTER_AUTH_URL` 固定为 localhost 而公网 Origin 不同 → 由 Better Auth 的
  精确 trusted origins 和 nginx 转发头共同提供边界；用公网、localhost、未知域名
  三类 Origin 验证。
- 误删仍在使用的 public 文件 → 部署前用全仓引用扫描和 `docker compose config`
  验证，不删除历史归档记录。

## Migration Plan

1. 更新根 compose 的固定认证变量。
2. 删除 public overlay 文件及当前 `.env.public`。
3. 更新部署文档并重新生成 Web 知识索引。
4. 运行 compose 配置、认证/CORS 定向测试、类型检查和 lint。
5. 回滚时恢复本次提交中的四个部署文件和原 compose 变量即可，无数据库迁移。

## Review Result

- 日期：2026-11-26
- 结论：`approved`
- 评审依据：用户明确要求删除 `setup-public` 相关配置，并指定
  `BETTER_AUTH_URL` 与 `AUTH_TRUSTED_ORIGINS` 的精确值；方案只调整部署认证
  边界，不改变页面或业务 API。
