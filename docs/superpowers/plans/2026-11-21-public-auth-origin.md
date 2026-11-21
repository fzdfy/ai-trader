# Public Auth Origin Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Better Auth、CORS 和 nginx 使用环境选择的精确公网 Origin，同时保持本地 `.env.local` 和默认 compose 启动不变。

**Architecture:** `.env.local` 继续作为本地基础环境；`.env.public` 仅提供公网认证覆盖，`docker-compose.public.yml` 将覆盖值注入 server。server 内使用一个纯函数解析精确 Origin allowlist，Better Auth 和 CORS 共同消费。

**Tech Stack:** Hono、Better Auth、Node test runner、Docker Compose、nginx。

**Spec:** `docs/superpowers/specs/2026-11-21-public-auth-origin-design.md`

## Global Constraints

- `.env.local` 内容和 `docker compose up -d` 本地启动行为保持不变。
- 一个 server 进程只能有一个 `BETTER_AUTH_URL`。
- `AUTH_TRUSTED_ORIGINS` 使用精确 scheme + host + port，不允许 `*.shares.zrok.io`。
- CORS 不得反射未知 Origin，携带凭据时必须使用固定 allowlist。
- Better Auth 和 CORS 必须消费同一个 Origin 解析结果。
- 公网地址变化只修改 `.env.public`，不修改应用代码或重新构建前端。
- 本变更无可见 UI，`Visual design: not applicable`。
- 每个行为任务先写失败测试，观看 RED，再做最小实现并取得 GREEN。

## File Structure

- Create: `apps/server/src/lib/auth-origins.ts` — 解析并校验 Origin allowlist。
- Create: `apps/server/src/lib/auth-origins.test.ts` — 纯函数与 CORS 决策测试。
- Modify: `apps/server/src/auth/index.ts` — Better Auth 使用共享 allowlist。
- Modify: `apps/server/src/main.ts` — Hono CORS 使用共享 allowlist。
- Modify: `docker-compose.yml` — 移除 server/worker/workflow-worker 的认证地址硬编码。
- Create: `docker-compose.public.yml` — 公网认证环境覆盖。
- Create: `.env.public.example` — 公网环境模板。
- Create: `.env.public` — 当前 zrok 公网环境，本地运行文件且不提交。
- Modify: `.gitignore` — 忽略 `.env.public`。
- Modify: `.dockerignore` — 排除 `.env.public`。
- Modify: `docker/nginx.conf` — 保留公网协议和 Host。
- Modify: `README.md`、`docs/architecture.md` — 记载双环境启动方式。
- Create: `openspec/changes/stabilize-public-auth-origin/verification.md` — 验证证据。

## Review Focus

- 未登记 Origin 仍被反射并获取凭据许可 → 测试未知 Origin 不返回 allow-origin。
- Better Auth 与 CORS 使用不同集合 → 测试两者共同调用 `resolveAuthOrigins`。
- `.env.public` 缺失时静默回退 localhost → compose 覆盖变量使用 required 插值。
- zrok TLS 终止后被识别为 HTTP → nginx 测试配置保留 `X-Forwarded-Proto: https`。
- 公网地址切换仍需代码或前端重建 → 文档和 compose 验证只修改 `.env.public`。

---

### Task 1: Origin allowlist pure functions

**Files:**
- Create: `apps/server/src/lib/auth-origins.ts`
- Test: `apps/server/src/lib/auth-origins.test.ts`

**Interfaces:**
- Produces: `parseTrustedOrigins(raw: string | undefined, baseUrl: string | undefined): string[]`
- Produces: `resolveCorsOrigin(origin: string | undefined, allowedOrigins: ReadonlySet<string>): string | null`

- [ ] **Step 1: Write failing origin tests**

Test comma splitting, whitespace trim, trailing slash normalization, duplicate removal, invalid `ftp:` rejection, fallback to `BETTER_AUTH_URL` plus `http://localhost:9080`, allowed exact Origin, unknown Origin rejection, and absent Origin returning `null`.

- [ ] **Step 2: Verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/auth-origins.test.ts`
Expected: FAIL because `auth-origins.ts` does not exist.

- [ ] **Step 3: Implement the two pure functions**

Parse only valid `http:` and `https:` URLs with `new URL(...).origin`; throw on malformed explicit values; deduplicate while preserving order. `resolveCorsOrigin` returns the normalized Origin only when present in the set.

- [ ] **Step 4: Verify GREEN**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/auth-origins.test.ts`
Expected: PASS with the listed cases.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/auth-origins.ts apps/server/src/lib/auth-origins.test.ts
git commit -m "feat: add trusted auth origin parsing"
```

### Task 2: Align Better Auth and CORS

**Files:**
- Modify: `apps/server/src/auth/index.ts`
- Modify: `apps/server/src/main.ts`
- Test: `apps/server/src/lib/auth-origins.test.ts`

**Interfaces:**
- Consumes: `parseTrustedOrigins`, `resolveCorsOrigin`
- Produces: one shared startup allowlist used by Better Auth and Hono CORS

- [ ] **Step 1: Add failing integration assertions**

Assert that a configured public Origin appears in Better Auth `trustedOrigins` and CORS decision output, while `https://evil.example` appears in neither.

- [ ] **Step 2: Verify RED**

Run the targeted origin test.
Expected: FAIL because production consumers still use hardcoded/reflected origins.

- [ ] **Step 3: Wire both consumers**

Resolve origins once at module startup from `AUTH_TRUSTED_ORIGINS` and `BETTER_AUTH_URL`; pass the array to Better Auth and the derived set to CORS.

- [ ] **Step 4: Verify GREEN**

Run the targeted test and `pnpm --filter @ai-trader/server test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/index.ts apps/server/src/main.ts apps/server/src/lib/auth-origins.test.ts
git commit -m "fix: enforce trusted auth origins"
```

### Task 3: Add local/public environment profiles

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker-compose.public.yml`
- Create: `.env.public.example`
- Create: `.env.public`
- Modify: `.gitignore`
- Modify: `.dockerignore`

**Interfaces:**
- Consumes: `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`
- Produces: default local compose and public compose overlay

- [ ] **Step 1: Verify current local environment fails the profile requirement**

Run: `docker compose config --format json`.
Expected: server receives hardcoded `BETTER_AUTH_URL=http://localhost:9080`.

- [ ] **Step 2: Remove hardcoded auth URL and add public overlay**

Allow `.env.local` to provide local values. Add public overlay with required `${BETTER_AUTH_URL:?}` and `${AUTH_TRUSTED_ORIGINS:?}` for server only. Add `.env.public.example` with `https://ouzq6euvec18.shares.zrok.io` and create ignored `.env.public` with the same two values.

- [ ] **Step 3: Verify local compose**

Run: `docker compose config --format json`.
Expected: local stack resolves without the public overlay and `.env.local` remains unchanged.

- [ ] **Step 4: Verify public compose**

Run: `docker compose --env-file .env.public -f docker-compose.yml -f docker-compose.public.yml config --format json`.
Expected: server has the zrok `BETTER_AUTH_URL` and exact matching `AUTH_TRUSTED_ORIGINS`; no secret values are printed.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker-compose.public.yml .env.public.example .gitignore .dockerignore
git commit -m "chore: add public auth environment profile"
```

### Task 4: Preserve public protocol through nginx

**Files:**
- Modify: `docker/nginx.conf`

- [ ] **Step 1: Add a failing proxy configuration assertion**

Run: `rg 'X-Forwarded-Proto \\$scheme' docker/nginx.conf`.
Expected: MATCH, proving the current config discards zrok HTTPS metadata.

- [ ] **Step 2: Update nginx forwarding**

Use `server_name _`; map `$http_x_forwarded_proto` to a non-empty forwarded protocol with `$scheme` fallback; pass `X-Forwarded-Host` and mapped protocol for API and health locations.

- [ ] **Step 3: Verify GREEN**

Run: `docker compose build nginx`.
Expected: nginx image builds successfully.

- [ ] **Step 4: Commit**

```bash
git add docker/nginx.conf
git commit -m "fix: preserve public protocol through nginx"
```

### Task 5: Document and verify public-origin rotation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Create: `openspec/changes/stabilize-public-auth-origin/verification.md`

- [ ] **Step 1: Document local and public commands**

Document `.env.public`, the compose overlay command, exact-Origin security boundary, and zrok address rotation without code changes.

- [ ] **Step 2: Run complete verification**

Run:

```bash
cd apps/server && node --import @oxc-node/core/register --test src/lib/auth-origins.test.ts
cd apps/server && pnpm test
pnpm check-types
pnpm lint
docker compose config --format json
docker compose --env-file .env.public -f docker-compose.yml -f docker-compose.public.yml config --format json
docker compose build server nginx
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify public behavior**

Run the public stack and request `/health` plus `/api/v1/system/me` with trusted and unknown `Origin` headers.
Expected: health succeeds; trusted Origin receives CORS permission; unknown Origin does not.

- [ ] **Step 4: Write verification evidence**

Record commands, results, skipped checks, residual risk, and exact deployment URL handling in `verification.md`.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/architecture.md openspec/changes/stabilize-public-auth-origin/verification.md
git commit -m "docs: document public auth origin configuration"
```
