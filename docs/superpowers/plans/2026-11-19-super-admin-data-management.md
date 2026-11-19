# 超级管理员数据管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有工作台内实现仅 `super_admin` 可访问的数据管理区域，复用数据中心与同步中心，提供数据源、表、同步、质量和审计，并保持普通用户的数据状态摘要。

**Architecture:** 以数据库角色和服务端中间件作为最终权限边界；把现有 data-center、sync 路由挂载到受保护的 `/api/v1/data-management`，新增轻量 `/api/v1/system/data-status` 给所有登录用户。前端通过 `/api/v1/system/me` 获取角色，只渲染获准的系统入口，并在路由加载阶段阻止未授权内容闪现。

**Tech Stack:** React 19、TanStack Router/Query、Preline UI、Tailwind CSS、Hono、Drizzle ORM、PostgreSQL、Better Auth、Node test runner。

**Spec:** `docs/superpowers/specs/2026-11-19-super-admin-data-management-design.md`

## Global Constraints

- 角色只有 `user` 和 `super_admin`；新用户默认 `user`。
- `SUPER_ADMIN_EMAILS` 只在服务端读取；角色数据库记录的静默降级禁止。
- 普通用户只显示“主题设置”，不显示“数据管理”“同步中心”或“数据中心”。
- 普通用户仍可使用不敏感的聚合数据状态。
- 数据源、限流、降级和凭据配置继续由代码注册表与环境变量提供。
- 一期只开放手动同步和单模块失败重试；禁止原始行、任意 SQL、凭据修改、历史回补、重建、暂停和删除。
- 所有数据管理 API 必须服务端校验 `super_admin`，不能只依赖前端隐藏菜单。
- 所有用户可见文案使用 zh-CN；代码标识使用英文。
- 前端视觉方向使用 `oil-ui`，实现使用现有 Preline 语义组件与语义 token。
- 每个行为任务先写失败测试，观看失败，再写最小实现并运行 GREEN。

## File Structure

### Server

- Modify: `apps/server/src/db/schema/auth.ts` — 增加 `user.role`。
- Modify: `apps/server/src/db/schema/ops.ts` — 增加管理员操作审计表。
- Create: `apps/server/src/lib/admin-access.ts` — 角色解析、白名单、当前用户和授权中间件。
- Create: `apps/server/src/lib/admin-access.test.ts` — 角色与白名单单元测试。
- Create: `apps/server/src/lib/admin-audit.ts` — 审计写入与终态收敛。
- Create: `apps/server/src/lib/data-quality.ts` — 数据质量和新鲜度纯函数。
- Create: `apps/server/src/lib/data-quality.test.ts` — 质量聚合测试。
- Create: `apps/server/src/api/system.ts` — 当前用户和聚合数据状态。
- Create: `apps/server/src/api/data-management.ts` — 挂载受保护的数据源、表、同步和审计路由。
- Modify: `apps/server/src/api/data-center.ts` — 增加 `/sources`、`/quality` 读模型，去掉重复的鉴权假设。
- Modify: `apps/server/src/api/sync.ts` — 手动同步审计、单模块重试。
- Modify: `apps/server/src/workers/sync-worker/runner.ts` — 暴露单模块执行函数。
- Modify: `apps/server/src/api/index.ts` — 新路由挂载和旧路径移除。
- Create: `apps/server/src/db/admin-schema.integration.ts` — 角色与审计表数据库验证。

### Web

- Create: `apps/web/src/hooks/useCurrentUser.ts` — 当前用户与角色。
- Create: `apps/web/src/hooks/useDataManagement.ts` — 数据源、质量、审计和动作。
- Create: `apps/web/src/lib/data-management-access.ts` — 角色到菜单的纯函数。
- Create: `apps/web/src/lib/data-management-access.test.ts` — 菜单最小权限测试。
- Modify: `apps/web/src/lib/workbench-navigation.ts` — 角色化系统入口与页面标题。
- Modify: `apps/web/src/routes/home/route.tsx` — 从服务端角色生成底部入口。
- Create: `apps/web/src/routes/home/data-management/route.tsx` — 权限门禁与共用布局。
- Create: `apps/web/src/routes/home/data-management/index.tsx` — 总览。
- Create: `apps/web/src/routes/home/data-management/sources.tsx` — 数据源。
- Create: `apps/web/src/routes/home/data-management/tables/index.tsx` — 数据表目录。
- Create: `apps/web/src/routes/home/data-management/tables/$table.tsx` — 表详情。
- Create: `apps/web/src/routes/home/data-management/sync.tsx` — 同步中心。
- Create: `apps/web/src/routes/home/data-management/quality.tsx` — 数据质量。
- Create: `apps/web/src/routes/home/data-management/audit.tsx` — 操作审计。
- Modify: `apps/web/src/routes/home/sync.tsx` — 旧链接重定向。
- Modify: `apps/web/src/routes/home/data-center/index.tsx`、`$table.tsx` — 旧链接重定向。
- Modify: `apps/web/src/hooks/useDataSync.ts` — 普通状态改走 `/system/data-status`。
- Create: `docs/design/prototypes/explorations/quant-workbench-data-management-v1.html` — 超级管理员视觉稿。

### Documentation

- Modify: `docs/data-pipeline.md` — 新入口、角色边界与审计。
- Modify: `docs/standards/database.md` — `user.role` 与审计表。
- Modify: `docs/standards/design.md` — 数据管理页面与角色化系统入口。

## Review Focus

- 角色加载延迟导致超级管理员入口闪现或普通用户暂存管理权限 → 测试 `null` 角色按普通用户处理。
- 菜单被隐藏但旧 API 仍可访问 → 测试旧页面重定向和所有管理 API 的 401/403。
- 手动同步与单模块重试并发写同表 → 同时存在运行任务时测试请求被拒绝。
- 失败、空表、陈旧表和断档被误显示为正常 → 测试质量状态组合和业务时间判断。
- 邮箱移出 `SUPER_ADMIN_EMAILS` 后现有角色被静默覆盖 → 测试数据库角色保持。

---

### Task 1: 角色模型与安全解析

**Files:**
- Modify: `apps/server/src/db/schema/auth.ts`
- Create: `apps/server/src/lib/admin-access.ts`
- Create: `apps/server/src/lib/admin-access.test.ts`
- Create: `apps/server/src/db/admin-schema.integration.ts`
- Generate: `apps/server/migrations/0035_*.sql`

**Interfaces:**
- Produces: `type AppRole = "user" | "super_admin"`
- Produces: `parseSuperAdminEmails(raw: string | undefined): Set<string>`
- Produces: `resolveEffectiveRole(email: string, storedRole: string | null, allowlist: ReadonlySet<string>): AppRole`
- Produces: `user.role` with default `user`

- [ ] **Step 1: Write failing role tests**

```ts
test("normalizes roles and bootstraps allowlisted emails", () => {
  assert.equal(resolveEffectiveRole("a@example.com", null, new Set()), "user");
  assert.equal(
    resolveEffectiveRole("a@example.com", "user", new Set(["a@example.com"])),
    "super_admin",
  );
  assert.equal(
    resolveEffectiveRole("a@example.com", "super_admin", new Set()),
    "super_admin",
  );
});
```

- [ ] **Step 2: Verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/admin-access.test.ts`
Expected: FAIL because `admin-access.ts` does not exist.

- [ ] **Step 3: Implement the role parser and schema**

Add `role text NOT NULL DEFAULT 'user'`; validate unknown values as `user`. Parse `SUPER_ADMIN_EMAILS` by comma/whitespace, lowercase, trim and remove empty entries.

- [ ] **Step 4: Verify GREEN**

Run: `node --import @oxc-node/core/register --test src/lib/admin-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify database constraint**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/db/admin-schema.integration.ts`
Expected: existing rows become `user`; invalid role insert fails with constraint error; allowlisted user can be promoted.

---

### Task 2: 当前用户与超级管理员中间件

**Files:**
- Modify: `apps/server/src/lib/admin-access.ts`
- Create: `apps/server/src/api/system.ts`
- Test: `apps/server/src/lib/admin-access.test.ts`

**Interfaces:**
- Produces: `getCurrentUser(c: Context): Promise<{ id, name, email, role } | null>`
- Produces: `requireSuperAdmin(): MiddlewareHandler`
- Produces: `GET /api/v1/system/me`

- [ ] **Step 1: Write failing authorization tests**

Test missing session → `401`; stored `user` → `403`; stored `super_admin` → allowed; client-supplied `X-User-Id` or role header never elevates access.

- [ ] **Step 2: Verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/admin-access.test.ts`
Expected: FAIL because middleware and `/system/me` do not exist.

- [ ] **Step 3: Implement server-side session + DB role lookup**

Use `auth.api.getSession({ headers: c.req.raw.headers })`, query `user.role` by session user ID, apply allowlist bootstrap, and persist only server-resolved role changes.

- [ ] **Step 4: Verify GREEN**

Run: `node --import @oxc-node/core/register --test src/lib/admin-access.test.ts`
Expected: PASS.

---

### Task 3: 普通用户聚合数据状态

**Files:**
- Create: `apps/server/src/lib/data-status.ts`
- Create: `apps/server/src/lib/data-status.test.ts`
- Modify: `apps/server/src/api/system.ts`

**Interfaces:**
- Produces: `buildPublicDataStatus(input): { updatedAt, availability, running }`
- Produces: `GET /api/v1/system/data-status`

- [ ] **Step 1: Write failing status mapping tests**

```ts
assert.deepEqual(buildPublicDataStatus({ updatedAt: null, runningJobs: [] }), {
  updatedAt: null,
  availability: "unavailable",
  running: false,
});
assert.equal(
  buildPublicDataStatus({ updatedAt: "2026-11-18T00:00:00.000Z", runningJobs: ["boards"] })
    .availability,
  "syncing",
);
```

- [ ] **Step 2: Verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/data-status.test.ts`
Expected: FAIL because mapper does not exist.

- [ ] **Step 3: Implement mapper and endpoint**

Return only `updatedAt`, `availability: "online" | "syncing" | "unavailable"`, and `running: boolean`. Do not return job names, errors, tables or sources.

- [ ] **Step 4: Verify GREEN**

Run: `node --import @oxc-node/core/register --test src/lib/data-status.test.ts`
Expected: PASS.

---

### Task 4: 数据管理 API 挂载与旧路径收口

**Files:**
- Create: `apps/server/src/api/data-management.ts`
- Modify: `apps/server/src/api/index.ts`
- Modify: `apps/server/src/api/data-center.ts`
- Modify: `apps/server/src/api/sync.ts`
- Test: `apps/server/src/api/index.test.ts`

**Interfaces:**
- Produces: protected `/api/v1/data-management/*`
- Removes: unprotected `/api/v1/sync/*` and `/api/v1/data-center/*`

- [ ] **Step 1: Write failing mount/auth tests**

Assert `/api/v1/data-management/tables` without session returns `401`; `user` session returns `403`; superadmin returns `200`; old `/api/v1/sync/run` is not mounted.

- [ ] **Step 2: Verify RED**

Run: `node --import @oxc-node/core/register --test src/api/index.test.ts`
Expected: FAIL because protected route tree is absent and old route remains.

- [ ] **Step 3: Mount protected router**

Create a Hono sub-app with `use("*", requireSuperAdmin())`; mount existing `dataCenterRoute` at `/` and `syncRoute` at `/sync`. Mount sub-app at `/data-management`, plus `systemRoute` at `/system`.

- [ ] **Step 4: Verify GREEN**

Run: `node --import @oxc-node/core/register --test src/api/index.test.ts`
Expected: PASS.

---

### Task 5: 操作审计与手动同步安全化

**Files:**
- Modify: `apps/server/src/db/schema/ops.ts`
- Create: `apps/server/src/lib/admin-audit.ts`
- Create: `apps/server/src/lib/admin-audit.test.ts`
- Modify: `apps/server/src/api/sync.ts`

**Interfaces:**
- Produces: `insertAdminAudit(input): Promise<number>`
- Produces: `finishAdminAudit(id, result): Promise<void>`
- `POST /api/v1/data-management/sync/run?force=true`

- [ ] **Step 1: Write failing audit tests**

Test accepted audit contains actor, action, reason, request ID; success and failure preserve the same row and set finished time; audit cannot be created without `super_admin`.

- [ ] **Step 2: Verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/admin-audit.test.ts`
Expected: FAIL because table/helper does not exist.

- [ ] **Step 3: Implement audit and wire manual sync**

Insert `accepted` before background work, transition to `running`/`success`/`failed`, and attach `jobRunId`. Continue using existing idempotency and conflict checks.

- [ ] **Step 4: Verify GREEN**

Run: `node --import @oxc-node/core/register --test src/lib/admin-audit.test.ts src/api/index.test.ts`
Expected: PASS.

---

### Task 6: 单模块失败重试

**Files:**
- Modify: `apps/server/src/workers/sync-worker/runner.ts`
- Modify: `apps/server/src/api/sync.ts`
- Create: `apps/server/src/lib/sync-retry.ts`
- Create: `apps/server/src/lib/sync-retry.test.ts`

**Interfaces:**
- Produces: `validateRetryCandidate(jobType, latestJob, activeJobs): { allowed: boolean; reason?: string }`
- Produces: `POST /api/v1/data-management/sync/modules/:jobType/retry`
- Requires request body: `{ reason: string }`

- [ ] **Step 1: Write failing retry validation tests**

Assert enabled failed module allowed; success/running module rejected; unknown module rejected; missing reason rejected; dependent module with unsuccessful upstream rejected.

- [ ] **Step 2: Verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/sync-retry.test.ts`
Expected: FAIL because retry module does not exist.

- [ ] **Step 3: Implement retry validation and background execution**

Reuse `RUNNERS` and `wrapJob`; do not duplicate pipe logic. Use existing `MANUAL_SYNC_JOBS` dependencies. Reject when any conflicting job is running.

- [ ] **Step 4: Verify GREEN**

Run: `node --import @oxc-node/core/register --test src/lib/sync-retry.test.ts`
Expected: PASS.

---

### Task 7: 数据源与质量读模型

**Files:**
- Modify: `apps/server/src/api/data-center.ts`
- Create: `apps/server/src/lib/data-quality.ts`
- Create: `apps/server/src/lib/data-quality.test.ts`
- Modify: `apps/server/src/lib/admin-audit.ts`

**Interfaces:**
- Produces: `GET /api/v1/data-management/sources`
- Produces: `GET /api/v1/data-management/quality`
- Produces: `GET /api/v1/data-management/audit`
- Produces: `buildQualitySummary(input): QualitySummary`

- [ ] **Step 1: Write failing quality tests**

Assert provider breaker → critical; unresolved gap → warning; stale table by explicit SLA → warning; empty table → missing; healthy fresh data → healthy.

- [ ] **Step 2: Verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/data-quality.test.ts`
Expected: FAIL because quality builder does not exist.

- [ ] **Step 3: Implement read models**

Aggregate source metadata from `DATA_CENTER_TABLES[*].sources`, health from existing quant call, quality from `dataGap`/`jobRun`/business time, and audit from the new table.

- [ ] **Step 4: Verify GREEN**

Run: `node --import @oxc-node/core/register --test src/lib/data-quality.test.ts`
Expected: PASS.

---

### Task 8: 角色化系统导航

**Files:**
- Create: `apps/web/src/hooks/useCurrentUser.ts`
- Create: `apps/web/src/lib/data-management-access.ts`
- Create: `apps/web/src/lib/data-management-access.test.ts`
- Modify: `apps/web/src/lib/workbench-navigation.ts`
- Modify: `apps/web/src/lib/workbench-navigation.test.ts`
- Modify: `apps/web/src/routes/home/route.tsx`

**Interfaces:**
- Produces: `canAccessDataManagement(role): boolean`
- Produces: `getSystemLinksForRole(role): readonly SystemLink[]`
- Consumes: `GET /api/v1/system/me`

- [ ] **Step 1: Write failing navigation tests**

Assert `super_admin` sees exactly `数据管理` and `主题设置`; `user` sees exactly `主题设置`; `null/undefined/loading` behaves as `user`; theme remains available to both.

- [ ] **Step 2: Verify RED**

Run: `node --test --experimental-strip-types src/lib/data-management-access.test.ts`
Expected: FAIL because role helper does not exist.

- [ ] **Step 3: Implement role query and filtered links**

Do not add a fourth bottom icon. Replace the two existing 同步中心/数据中心 icons with one 数据管理 icon for superadmins; render only 主题设置 otherwise.

- [ ] **Step 4: Verify GREEN**

Run: `node --test --experimental-strip-types src/lib/data-management-access.test.ts src/lib/workbench-navigation.test.ts`
Expected: PASS.

---

### Task 9: 数据管理页面与路由门禁

**Files:**
- Create: `docs/design/prototypes/explorations/quant-workbench-data-management-v1.html`
- Create: `apps/web/src/routes/home/data-management/route.tsx`
- Create: `apps/web/src/routes/home/data-management/index.tsx`
- Create: `apps/web/src/routes/home/data-management/sources.tsx`
- Create: `apps/web/src/routes/home/data-management/tables/index.tsx`
- Create: `apps/web/src/routes/home/data-management/tables/$table.tsx`
- Create: `apps/web/src/routes/home/data-management/sync.tsx`
- Create: `apps/web/src/routes/home/data-management/quality.tsx`
- Create: `apps/web/src/routes/home/data-management/audit.tsx`
- Create: `apps/web/src/hooks/useDataManagement.ts`

**Interfaces:**
- Consumes: `/api/v1/system/me`
- Consumes: `/api/v1/data-management/*`

- [ ] **Step 1: Create visual exploration before production UI**

Use `oil-ui` and the current default prototype. Place first-screen content immediately, no hero. Render desktop/mobile and light/dark screenshots. Cover loading, empty, stale, degraded, error and unauthorized states.

- [ ] **Step 2: Write failing guard tests**

Assert `super_admin` renders management shell; `user` is redirected to `/home`; unknown role renders no data content; legacy `/home/sync` and `/home/data-center` redirect correctly.

- [ ] **Step 3: Verify RED**

Run: `node --test --experimental-strip-types src/lib/data-management-access.test.ts`
Expected: FAIL because route contribution helpers do not exist.

- [ ] **Step 4: Implement routes and pages**

Use existing Preline `Card`, `Table`, `Badge`, `Button`, `TextInput` and theme tokens. Reuse `DataTableList`, `DataTableDetailView`, `SyncCenterTab` where possible.

- [ ] **Step 5: Verify page rendering**

Run: `pnpm --filter @ai-trader/web check-types && pnpm --filter @ai-trader/web build`
Expected: both commands exit 0.

---

### Task 10: 操作交互与兼容入口

**Files:**
- Modify: `apps/web/src/hooks/useDataSync.ts`
- Modify: `apps/web/src/routes/home/sync.tsx`
- Modify: `apps/web/src/routes/home/data-center/index.tsx`
- Modify: `apps/web/src/routes/home/data-center/$table.tsx`
- Modify: `apps/web/src/routes/home/-private/SyncCenterTab.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/data-management/sync/run`
- Consumes: `POST /api/v1/data-management/sync/modules/:jobType/retry`

- [ ] **Step 1: Write failing action-state tests**

Assert retry disabled without failed state or reason; manual sync disabled while conflicting job runs; success/failure updates audit and run queries; old URLs redirect without exposing content.

- [ ] **Step 2: Verify RED**

Run: `node --test --experimental-strip-types src/lib/data-management-access.test.ts`
Expected: FAIL because action policy helpers do not exist.

- [ ] **Step 3: Implement controls and redirects**

Use confirmation before writes, display scope and reason, show server errors, and invalidate sync/audit queries after completion.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter @ai-trader/web test`
Expected: all tests pass.

---

### Task 11: 文档与视觉验收

**Files:**
- Modify: `docs/data-pipeline.md`
- Modify: `docs/standards/database.md`
- Modify: `docs/standards/design.md`
- Create: `openspec/changes/add-super-admin-data-management/verification.md`

**Interfaces:**
- Documents only; no runtime contract.

- [ ] **Step 1: Update stable docs**

Document the new API boundary, roles, audit table and management route. Record that source configuration remains code/env-defined.

- [ ] **Step 2: Verify screenshots**

Run the `oil-ui` screenshot tool or project Chrome workflow at desktop and mobile, light and dark. Confirm no horizontal overflow, visible focus, readable labels, no unauthorized content flash.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm --filter @ai-trader/server test
pnpm --filter @ai-trader/server check-types
pnpm --filter @ai-trader/server lint
pnpm --filter @ai-trader/web test
pnpm --filter @ai-trader/web check-types
pnpm --filter @ai-trader/web lint
pnpm --filter @ai-trader/web build
openspec validate add-super-admin-data-management --strict
```

Expected: every command exits 0.

- [ ] **Step 4: Write verification report**

Record exact commands, pass/fail counts, skipped integration tests, screenshots, uncovered environment limitations and manual checks in `verification.md`.

## Execution Handoff

Recommended: Native execution. The change spans auth, API, database and frontend, so serial implementation avoids conflicting edits to shared routes and schema; one final independent review should cover the complete change.
