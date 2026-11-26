# Tasks

Visual design: not applicable. 本变更只调整认证和部署配置，不修改页面、组件、可见状态或交互。

## 1. Authentication Configuration

- [x] 1.1 将 server、worker、workflow-worker 的 `BETTER_AUTH_URL` 固定为
  `http://localhost:9180`，并为 server 设置
  `AUTH_TRUSTED_ORIGINS=https://whtefvmqpezr.shares.zrok.io,http://localhost`；
  运行 `docker compose config --format json` 验证三个服务值完全匹配。
- [x] 1.2 使用现有认证与 CORS 定向测试验证公网 Origin、`localhost:9180` 和未知
  Origin 的允许/拒绝边界；运行
  `cd apps/server && node --import @oxc-node/core/register --test src/lib/auth-origins.test.ts src/lib/cors.test.ts src/auth/index.test.ts`。

## 2. Remove Public Overlay

- [x] 2.1 删除 `deploy/setup-public.sh`、`docker-compose.public.yml`、
  `.env.public.example` 和当前 `.env.public`，移除 `.gitignore` /
  `.dockerignore` 中的 public env 条目；运行
  `rg -n "setup-public|docker-compose\\.public|\\.env\\.public" README.md docs/architecture.md deploy docker-compose.yml .gitignore .dockerignore apps/web/src/generated/knowledge.ts`
  验证生效文档、脚本和配置中无残留引用。
- [x] 2.2 更新 `deploy/setup.sh`、README 和 `docs/architecture.md`，改为单一
  compose 同时支持 zrok 与 localhost；运行
  `pnpm --filter @ai-trader/web generate:knowledge` 重新生成知识索引，并验证生成
  内容不再包含 public overlay 流程。

## 3. Final Verification

- [x] 3.1 运行 `pnpm check-types`、`pnpm lint`、
  `pnpm exec openspec validate simplify-auth-origin-config --strict` 和
  `git diff --check`，记录最新结果。
- [x] 3.2 用重建后的 server 验证公网与 localhost 认证配置来自同一 compose，
  记录容器环境、CORS 结果和回滚方式，写入 `verification.md` 并提交用户验收。

## Workflow follow-up

- 用户验收后才可单独确认归档。
- 归档时同步 `public-auth-origin` 增量规格到 `openspec/specs/`。
