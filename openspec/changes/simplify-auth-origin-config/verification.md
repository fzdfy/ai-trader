# Verification

## Environment

- 日期：2026-11-26
- 分支：`codex/simplify-auth-origin-config`
- Visual design: not applicable；本变更没有页面、组件、交互或可见状态变化。

## Automated Checks

| Check | Command | Result |
|---|---|---|
| Compose 配置 | `docker compose config --format json` | server / worker / workflow-worker 均为 `BETTER_AUTH_URL=http://localhost:9180`；server 的 `AUTH_TRUSTED_ORIGINS` 与目标值完全一致 |
| 认证与 CORS | `cd apps/server && node --import @oxc-node/core/register --test src/lib/auth-origins.test.ts src/lib/cors.test.ts src/auth/index.test.ts` | 10 passed，0 failed |
| 类型检查 | `pnpm check-types` | 3/3 packages passed |
| Lint | `pnpm lint` | 0 errors；53 个仓库既有 warning |
| OpenSpec | `pnpm exec openspec validate simplify-auth-origin-config --strict` | valid |
| Whitespace | `git diff --check` | passed |
| 生效文件残留 | `rg -n "setup-public\|docker-compose\\.public\|\\.env\\.public" README.md docs/architecture.md deploy docker-compose.yml .gitignore .dockerignore apps/web/src/generated/knowledge.ts` | no matches |

## Runtime Authentication

重建 `server`、`worker`、`workflow-worker` 后读取实际容器环境：

```text
server BETTER_AUTH_URL=http://localhost:9180
worker BETTER_AUTH_URL=http://localhost:9180
workflow-worker BETTER_AUTH_URL=http://localhost:9180
server AUTH_TRUSTED_ORIGINS=https://whtefvmqpezr.shares.zrok.io,http://localhost
```

使用本地测试账号请求 `/api/auth/sign-in/email`：

| Origin | Status | Allow-Origin | Session Cookie |
|---|---:|---|---|
| `https://whtefvmqpezr.shares.zrok.io` | 200 | 同名 Origin | 已设置 |
| `http://localhost:9180` | 200 | 同名 Origin | 已设置 |
| `https://evil.example` | 403 | 无 | 未设置 |

## Acceptance Criteria Evidence

| AC | 证据 | 状态 |
|---|---|---|
| AC-1 | Compose 输出和三个重建容器均显示固定 localhost URL | 通过 |
| AC-2 | Compose 输出与 server 容器环境精确匹配目标 allowlist | 通过 |
| AC-3 | 4 个 public overlay 文件已删除；生效入口文档无残留引用 | 通过 |
| AC-4 | 公网与 localhost 登录均返回 200；未知 Origin 返回 403 | 通过 |

## Notes and Limitations

- `deploy/setup-public.sh`、`docker-compose.public.yml`、`.env.public.example`
  和本地 `.env.public` 已删除，因此不再有公网 overlay 回滚入口。
- 历史归档和 `docs/superpowers/` 中的旧方案仍保留原公网 overlay 描述，作为历史
  记录，不再作为当前部署入口。
- 未修改数据库、业务 API、前端页面或 Worker 业务逻辑。
- 回滚需要恢复本次删除的四个文件，并恢复改动前的 compose 认证变量；没有数据迁移
  需要回滚。
- 归档必须在用户验收后单独确认。
