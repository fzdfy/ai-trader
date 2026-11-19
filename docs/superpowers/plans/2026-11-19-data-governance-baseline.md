# 数据治理基线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有数据管理基础上建立可执行的治理目录、来源标准版本治理、质量证据、Tier 0 研究门禁、数据事故和最小治理 Work Task。

**Architecture:** 静态治理元数据保存在版本受控的代码注册表，质量结果、事故和任务证据写入 PostgreSQL。系统 Worker 每日检测 `a-stock-data` commit、版本标签与 `SKILL.md` checksum；Tier 0 质量失败由服务端门禁阻止新回测、选股和个股分析，治理页面嵌入现有 `/home/data-management`。

**Tech Stack:** React 19、TanStack Router/Query、Preline UI、Tailwind CSS、Hono、Drizzle ORM、PostgreSQL、Node test runner、现有 sync-worker 调度。

**Spec:** `openspec/changes/add-data-governance-baseline/design.md`

## Global Constraints

- 静态治理元数据以代码注册表为事实源；数据库只保存质量结果、事故、来源版本事件、Work Task 和审计。
- `a-stock-data` 固定 repository commit SHA、版本标签和 `SKILL.md` SHA-256，不依赖 releases/tags 或 latest。
- 生产运行不得读取或依赖 Agent Skill；上游变化不得自动修改 Provider、注册表、限流或降级配置。
- Tier 0 严重质量事故阻止新的回测、选股和个股分析；Tier 1 警告；Tier 2 仅记录。
- 所有治理详情 API 只允许 `super_admin`；普通用户只保留非敏感聚合数据状态。
- 不提供原始数据行、任意 SQL、静态治理元数据在线编辑或治理证据删除接口。
- Work Task 仅实现治理审阅所需的最小通用模型，不实现完整工作任务中心。
- 治理页面使用现有 Preline 语义组件、Tailwind token 和 `oil-ui` 视觉流程。
- 用户可见文案使用 zh-CN；代码标识使用英文。
- 不改变 Provider 选择规则、复权 PIT 规则或 `load_kline` 输出契约。
- 每个行为先写失败测试，看到预期 RED，再写最小实现并运行 GREEN。
- 只暂存本任务明确列出的文件；禁止 `git add -A`，不得带入工作区现有无关改动。

## File Structure

### Governance Registry

- Create: `apps/server/src/lib/data-governance/types.ts` — 数据域、Tier、责任、契约、血缘和保留类型。
- Create: `apps/server/src/lib/data-governance/registry.ts` — 全部生产资产治理注册表与查询。
- Create: `apps/server/src/lib/data-governance/validation.ts` — 注册表完整性校验。
- Create: `apps/server/src/lib/data-governance/generate-docs.ts` — 从注册表生成治理目录。
- Create: `apps/server/src/lib/data-governance/source-standards.ts` — 固定来源标准版本和快照元数据。
- Create: `apps/server/src/lib/data-governance/quality-rules.ts` — 版本化规则定义。
- Create: `apps/server/src/lib/data-governance/quality-checks.ts` — 安全数据库检查器。
- Create: `apps/server/src/lib/data-governance/quality-runner.ts` — 扫描与结果写入。
- Create: `apps/server/src/lib/data-governance/quality-gate.ts` — 研究门禁。
- Create: `apps/server/src/lib/data-governance/incidents.ts` — 数据事故生命周期。
- Create: `apps/server/src/lib/data-governance/work-tasks.ts` — 治理 Work Task 生命周期。
- Create: `apps/server/src/lib/data-governance/source-standard-monitor.ts` — 上游版本比较。
- Create: `docs/external/a-stock-data/<commit>/` — 固定的 SKILL、CHANGELOG 和来源元数据。
- Create: `docs/data-governance/catalog.md` — 自动生成资产目录。

### Database

- Create: `apps/server/src/db/schema/governance.ts` — 质量结果、事故、事件、Work Task Schema。
- Modify: `apps/server/src/db/schema/index.ts` — 导出治理表。
- Generate: `apps/server/migrations/0036_*.sql` — 运行证据表和状态约束。

### Server API and Worker

- Create: `apps/server/src/api/governance.ts` — 治理只读与控制 API。
- Modify: `apps/server/src/api/data-management.ts` — 挂载 `/governance` 子路由。
- Modify: `apps/server/src/api/backtests.ts` — 新回测前执行 Tier 0 门禁。
- Modify: `apps/server/src/api/screens.ts` — 新选股任务前执行 Tier 0 门禁。
- Modify: `apps/server/src/api/stock-analysis.ts` — 新分析前执行 Tier 0 门禁。
- Modify: `apps/server/src/workers/sync-worker/cron-config.ts` — 增加质量扫描和来源标准巡检。
- Modify: `apps/server/src/workers/sync-worker/runner.ts` — 暴露治理任务执行和同步后触发。
- Modify: `apps/server/src/workers/sync-worker/index.ts` — 接入新 Worker jobs。
- Create: `apps/server/src/db/governance-schema.integration.ts` — 数据库约束与事件测试。

### Web

- Create: `apps/web/src/hooks/useDataGovernance.ts` — 治理查询和状态动作。
- Create: `apps/web/src/routes/home/data-management/governance/index.tsx` — 治理总览。
- Create: `apps/web/src/routes/home/data-management/governance/assets.tsx` — 资产目录。
- Create: `apps/web/src/routes/home/data-management/governance/quality.tsx` — 规则与结果。
- Create: `apps/web/src/routes/home/data-management/governance/source-standards.tsx` — 来源标准版本。
- Create: `apps/web/src/routes/home/data-management/governance/work-tasks.tsx` — 治理 Work Task。
- Create: `apps/web/src/routes/home/data-management/governance/incidents.tsx` — 数据事故。
- Modify: `apps/web/src/routes/home/data-management/route.tsx` — 增加治理二级导航。
- Modify: `apps/web/src/lib/workbench-navigation.ts` — 治理页面标题和面包屑。
- Modify: `docs/design/prototypes/explorations/quant-workbench-data-governance-v1.html` — 已完成的治理视觉探索稿；实施时按确认稿还原。

### Documentation and Verification

- Modify: `docs/data-pipeline.md` — 来源标准、质量门禁和事故处理。
- Modify: `docs/standards/database.md` — 治理证据表和 PIT/保留约束。
- Modify: `docs/standards/design.md` — 治理页面信息架构。
- Modify: `docs/standards/development-workflow.md` — `a-stock-data` 升级流程。
- Create: `openspec/changes/add-data-governance-baseline/verification.md` — 验证报告。

## Review Focus

- Tier 0 门禁使用过期或错误资产结果导致错误放行或误阻断 → 测试无结果、结果过期、重启后状态和事故优先级。
- 注册表与真实 Schema 漂移导致治理页遗漏资产 → 测试注册表唯一性、Schema 差异检查和文档生成 diff。
- `a-stock-data` commit 改变但巡检未生成或重复生成 Work Task → 测试 SHA/checksum 变化、网络失败和幂等。
- 普通用户绕过菜单直接访问治理 API 或搜索入口 → 测试无会话 401、普通用户 403 和前端加载中最小权限。
- 质量阈值调整导致历史结果不可比较 → 测试结果保存规则版本和参数。

---

## Pre-Implementation Design Gate

- [x] 从当前数据管理工作台视觉复制并创建 `docs/design/prototypes/explorations/quant-workbench-data-governance-v1.html`
- [x] 覆盖桌面、移动端、浅色和深色的真实截图，并清零溢出、对比度和过小文字提示
- [x] 完成一轮独立视觉评审并处理阻塞问题
- [x] 用户确认视觉设计稿
- [x] 用户确认后才允许执行 Task 1 至 Task 13

视觉方向：沿用现有工作台和数据管理控制台，不新增主壳；首屏以“研究门禁、来源标准漂移、未解决事故”为视觉主角，资产和规则通过紧凑列表展开。

### Task 1: Governance Domain Types and Validation

**Files:**
- Create: `apps/server/src/lib/data-governance/types.ts`
- Create: `apps/server/src/lib/data-governance/validation.ts`
- Test: `apps/server/src/lib/data-governance/validation.test.ts`

**Interfaces:**
- Produces: `DataDomain = "reference" | "market_raw" | "market_intelligence" | "research_derived" | "application"`
- Produces: `DataTier = "tier_0" | "tier_1" | "tier_2"`
- Produces: `ResearchConsumer = "backtest" | "screening" | "stock_analysis"`
- Produces: `Responsibility = { name: string; role?: string; contact?: string }`
- Produces: `RetentionPolicy = { mode: "permanent" | "duration" | "rebuildable"; durationDays?: number; note: string }`
- Produces: `DataContract = { businessDefinition: string; grain: string; primaryKey: string[]; eventTimeField: string; knownAtField?: string; freshnessSlaHours: number; allowedConsumers: ResearchConsumer[] }`
- Produces: `GovernanceAsset`
- Produces: `validateGovernanceRegistry(assets: readonly GovernanceAsset[]): string[]`

- [ ] **Step 1: Write failing validation tests**

```ts
const validAsset: GovernanceAsset = {
  key: "bar1d_raw",
  name: "原始日线",
  kind: "raw",
  domain: "market_raw",
  tier: "tier_0",
  responsibilities: {
    owner: { name: "Data Platform" },
    steward: { name: "Quant Research" },
    operator: { name: "Super Administrator", role: "super_admin" },
  },
  classification: "internal",
  retention: { mode: "permanent", note: "原始行情与 PIT 数据长期保留" },
  contract: {
    businessDefinition: "未复权日线 OHLCV",
    grain: "symbol + time",
    primaryKey: ["symbol", "time"],
    eventTimeField: "time",
    freshnessSlaHours: 96,
    allowedConsumers: ["backtest", "screening", "stock_analysis"],
  },
  sourceStandardRefs: ["a-stock-data"],
  lineage: {
    upstreamAssets: [],
    downstreamAssets: ["adj_factor", "bar1d_qfq", "bar1d_hfq"],
    jobTypes: ["kline-1d"],
  },
};

test("rejects duplicate keys and missing responsibility", () => {
  assert.deepEqual(validateGovernanceRegistry([validAsset]), []);
  assert.match(validateGovernanceRegistry([validAsset, validAsset]).join("\n"), /duplicate/);
  assert.match(
    validateGovernanceRegistry([
      { ...validAsset, responsibilities: { ...validAsset.responsibilities, owner: { name: "" } } },
    ]).join("\n"),
    /owner/,
  );
});

test("requires a contract for tier zero assets", () => {
  assert.match(
    validateGovernanceRegistry([
      { ...validAsset, contract: { ...validAsset.contract, primaryKey: [] } },
    ]).join("\n"),
    /Tier 0/,
  );
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/validation.test.ts`
Expected: FAIL because governance types and validator do not exist.

- [ ] **Step 3: Implement the exact governance types and validator**

Validation checks unique `key`, required responsibilities, non-empty contract fields for Tier 0, valid retention, unique lineage targets and no self-reference.

- [ ] **Step 4: Run test to verify GREEN**

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files**

```bash
git add apps/server/src/lib/data-governance/types.ts apps/server/src/lib/data-governance/validation.ts apps/server/src/lib/data-governance/validation.test.ts
git commit -m "feat: define data governance model"
```

### Task 2: Complete Asset Registry and Generated Catalog

**Files:**
- Create: `apps/server/src/lib/data-governance/registry.ts`
- Create: `apps/server/src/lib/data-governance/generate-docs.ts`
- Create: `apps/server/src/lib/data-governance/registry.test.ts`
- Create: `docs/data-governance/catalog.md`

**Interfaces:**
- Produces: `GOVERNANCE_ASSETS: readonly GovernanceAsset[]`
- Produces: `getGovernanceAsset(assetKey: string): GovernanceAsset | undefined`
- Produces: `generatedCatalog(): string`

- [ ] **Step 1: Write failing registry and generation tests**

```ts
test("governance registry covers every data-center asset and has unique keys", () => {
  assert.deepEqual(validateGovernanceRegistry(GOVERNANCE_ASSETS), []);
  assert.equal(new Set(GOVERNANCE_ASSETS.map((asset) => asset.key)).size, GOVERNANCE_ASSETS.length);
  for (const definition of DATA_CENTER_TABLES) {
    assert.ok(GOVERNANCE_ASSETS.some((asset) => asset.key === definition.table));
  }
});

test("generated catalog is deterministic", () => {
  assert.equal(generatedCatalog(), generatedCatalog());
  assert.match(generatedCatalog(), /bar1d_raw/);
  assert.match(generatedCatalog(), /tier_0/);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/registry.test.ts`
Expected: FAIL because registry and generator do not exist.

- [ ] **Step 3: Inventory every production table, view and operational asset**

Generate the inventory from Drizzle Schema and migration-created views, then assign explicit domain, responsibilities, Tier, classification, retention, contract, source-standard references, upstream/downstream assets and consumers. Include application assets needed by research gates, such as stored backtest/analysis results when they become consumers.

- [ ] **Step 4: Generate stable Markdown and verify GREEN**

Run: `node --import @oxc-node/core/register apps/server/src/lib/data-governance/generate-docs.ts`
Expected: `docs/data-governance/catalog.md` is created or updated.

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify generated documentation has no drift**

Run: `node --import @oxc-node/core/register apps/server/src/lib/data-governance/generate-docs.ts && git diff --check docs/data-governance/catalog.md`
Expected: generation succeeds and no whitespace errors.

- [ ] **Step 6: Commit scoped files**

```bash
git add apps/server/src/lib/data-governance/registry.ts apps/server/src/lib/data-governance/generate-docs.ts apps/server/src/lib/data-governance/registry.test.ts docs/data-governance/catalog.md
git commit -m "feat: add complete data governance catalog"
```

### Task 3: Governance Evidence Schema

**Files:**
- Create: `apps/server/src/db/schema/governance.ts`
- Modify: `apps/server/src/db/schema/index.ts`
- Create: `apps/server/src/db/governance-schema.integration.ts`
- Modify: `docs/standards/database.md`
- Generate: `apps/server/migrations/0036_*.sql`

**Interfaces:**
- Produces Drizzle tables: `dataQualityResult`, `dataIncident`, `dataIncidentEvent`, `workTask`, `workTaskEvent`
- Produces statuses: quality `passed|warning|failed|error`; incident `open|acknowledged|resolving|resolved|closed`; task `pending|in_progress|completed|canceled`

- [ ] **Step 1: Write failing database integration tests**

```ts
test("governance schema enforces status constraints and append events", { skip: ... }, async () => {
  const result = await insertQualityResultFixture();
  assert.ok(result.id > 0);
  await assert.rejects(() => insertQualityStatus("unknown"), /23514/);
  await assert.rejects(() => insertTaskStatus("unknown"), /23514/);
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/db/governance-schema.integration.ts`
Expected: FAIL because governance tables do not exist.

- [ ] **Step 3: Add Schema and generate migration**

Add `bigint` job and relation IDs, JSONB evidence payloads, timestamps, status check constraints and required indices. Export tables from `schema/index.ts`.

Document the evidence tables, status constraints and append-only rule in `docs/standards/database.md`.

Run from `apps/server`: `node_modules/.bin/drizzle-kit generate --name data_governance_evidence`
Expected: migration `0036_*` contains only governance tables, constraints and indices.

- [ ] **Step 4: Apply migration and verify GREEN**

Run: `DATABASE_URL="$DATABASE_URL" node_modules/.bin/drizzle-kit migrate`
Expected: migration succeeds.

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/db/governance-schema.integration.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files and generated migration**

```bash
git add apps/server/src/db/schema/governance.ts apps/server/src/db/schema/index.ts apps/server/src/db/governance-schema.integration.ts docs/standards/database.md apps/server/migrations/0036_*.sql apps/server/migrations/meta
git commit -m "feat: add data governance evidence schema"
```

### Task 4: Incident and Governance Work Task Lifecycles

**Files:**
- Create: `apps/server/src/lib/data-governance/incidents.ts`
- Create: `apps/server/src/lib/data-governance/work-tasks.ts`
- Create: `apps/server/src/lib/data-governance/incidents.test.ts`
- Create: `apps/server/src/lib/data-governance/work-tasks.test.ts`

**Interfaces:**
- Produces: `OpenIncidentInput = { assetKey: string | null; incidentType: string; severity: "warning" | "critical"; title: string; description: string; payloadJson: Record<string, unknown> }`
- Produces: `openIncident(input: OpenIncidentInput): Promise<number>`
- Produces: `CreateWorkTaskInput = { taskType: string; title: string; priority: "normal" | "high" | "critical"; ownerRole: string; relatedType: string | null; relatedId: string | null; payloadJson: Record<string, unknown> }`
- Produces: `transitionIncident(id: number, event: IncidentTransition): Promise<void>`
- Produces: `listIncidentEvents(id: number): Promise<DataIncidentEvent[]>`
- Produces: `DataIncidentEvent` as an event row with actor, event type, message, payload and creation time.
- Produces: `createWorkTask(input: CreateWorkTaskInput): Promise<number>`
- Produces: `transitionWorkTask(id: number, event: WorkTaskTransition): Promise<void>`
- Produces: `getWorkTask(id: number): Promise<WorkTaskDetail | null>`
- Produces: `WorkTaskEvent` as an event row with actor, event type, message, payload and creation time.
- Produces: `WorkTaskDetail` as the current Work Task row plus its ordered events.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
test("incident transitions append events and reject invalid transitions", async () => {
  const id = await openIncident({ incidentType: "quality", severity: "critical", ... });
  await transitionIncident(id, { action: "acknowledge", actorUserId: "admin", message: "开始处理" });
  await transitionIncident(id, { action: "resolve", actorUserId: "admin", message: "已恢复" });
  await assert.rejects(() => transitionIncident(id, { action: "resolve", ... }), /invalid transition/);
  assert.equal((await listIncidentEvents(id)).length, 3);
});

test("work task preserves creation context after completion", async () => {
  const id = await createWorkTask({ taskType: "source_standard_review", payloadJson: { commitSha: "a" }, ... });
  await transitionWorkTask(id, { action: "start", actorUserId: "admin" });
  await transitionWorkTask(id, { action: "complete", actorUserId: "admin", resultJson: { approved: false } });
  const task = await getWorkTask(id);
  assert.deepEqual(task?.payloadJson, { commitSha: "a" });
  assert.equal(task?.status, "completed");
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/data-governance/incidents.test.ts src/lib/data-governance/work-tasks.test.ts`
Expected: FAIL because lifecycle services do not exist.

- [ ] **Step 3: Implement transactions and terminal guards**

Each transition MUST use a transaction, validate the current state, update current row and insert one append-only event. Incident resolution requires a message; Work Task completion requires an actor and result JSON.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/data-governance/incidents.test.ts src/lib/data-governance/work-tasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files**

```bash
git add apps/server/src/lib/data-governance/incidents.ts apps/server/src/lib/data-governance/work-tasks.ts apps/server/src/lib/data-governance/incidents.test.ts apps/server/src/lib/data-governance/work-tasks.test.ts
git commit -m "feat: add governance incident and task lifecycles"
```

### Task 5: Versioned Quality Rule Registry

**Files:**
- Create: `apps/server/src/lib/data-governance/quality-rules.ts`
- Create: `apps/server/src/lib/data-governance/quality-rules.test.ts`

**Interfaces:**
- Produces: `QualityRuleDefinition`
- Produces: `QUALITY_RULES: readonly QualityRuleDefinition[]`
- Produces: `getQualityRulesForAssets(assetKeys: readonly string[], triggerJobType?: string): QualityRuleDefinition[]`

- [ ] **Step 1: Write failing rule registry tests**

```ts
test("tier zero assets receive all required quality dimensions", () => {
  const rules = getQualityRulesForAssets(["bar1d_raw"]);
  assert.deepEqual(
    new Set(rules.map((rule) => rule.dimension)),
    new Set(["freshness", "completeness", "uniqueness", "validity", "coverage", "consistency", "pit"]),
  );
  assert.ok(rules.every((rule) => rule.version >= 1 && rule.assetKey === "bar1d_raw"));
});

test("trigger filtering selects only affected rules", () => {
  assert.ok(getQualityRulesForAssets(["bar1d_raw"], "kline-1d").every((rule) => rule.triggerJobTypes.includes("kline-1d")));
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/quality-rules.test.ts`
Expected: FAIL because quality rule registry does not exist.

- [ ] **Step 3: Implement rule definitions**

Define rules for `freshness.business_time`, `completeness.required_columns`, `uniqueness.primary_key`, `validity.ohlcv`, `coverage.active_symbols`, `consistency.calendar_alignment`, `pit.as_of_known_at`. Each includes immutable `id`, `version`, `assetKey`, `dimension`, `severity`, `triggerJobTypes`, `params`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/quality-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files**

```bash
git add apps/server/src/lib/data-governance/quality-rules.ts apps/server/src/lib/data-governance/quality-rules.test.ts
git commit -m "feat: define versioned data quality rules"
```

### Task 6: Database Quality Checks and Result Persistence

**Files:**
- Create: `apps/server/src/lib/data-governance/quality-checks.ts`
- Create: `apps/server/src/lib/data-governance/quality-runner.ts`
- Create: `apps/server/src/lib/data-governance/quality-runner.test.ts`
- Modify: `apps/server/src/lib/data-governance/incidents.ts`

**Interfaces:**
- Produces: `type QualityRuleExecutor = (rule: QualityRuleDefinition, context: QualityExecutionContext) => Promise<QualityCheckResult>`
- Produces: `QualityExecutionContext = { asset: GovernanceAsset; now: Date; jobRunId: number | null; requestId: string | null }`
- Produces: `QualityCheckResult = { ruleId: string; status: "passed" | "warning" | "failed" | "error"; severity: "warning" | "critical"; observedValue: number | null; details: Record<string, unknown> }`
- Produces: `executeQualityRule(rule, context): Promise<QualityCheckResult>`
- Produces: `runQualityChecks(input: RunQualityChecksInput, execute?: QualityRuleExecutor): Promise<QualityRunSummary>`
- Produces: `loadLatestQualityResults(assetKeys: readonly string[]): Promise<DataQualityResult[]>`
- Consumes: `QUALITY_RULES`, `data_quality_result`, `data_incident`

- [ ] **Step 1: Write failing integration tests**

```ts
test("quality runner persists evidence with rule version and job context", { skip: ... }, async () => {
  const summary = await runQualityChecks({
    assetKeys: ["bar1d_raw"],
    jobRunId: fixtureJobId,
    requestId: "request-1",
    now: new Date("2026-11-19T10:00:00Z"),
  });
  assert.ok(summary.results.some((result) => result.ruleId === "validity.ohlcv"));
  const rows = await loadLatestQualityResults(["bar1d_raw"]);
  assert.ok(rows.every((row) => row.ruleVersion >= 1));
});

test("critical repeated failures open or update one incident", { skip: ... }, async () => {
  const alwaysCritical: QualityRuleExecutor = async (rule) => ({
    ruleId: rule.id,
    status: "failed",
    severity: "critical",
    observedValue: 0,
    details: {},
  });
  await runQualityChecks({ assetKeys: ["bar1d_raw"], ... }, alwaysCritical);
  await runQualityChecks({ assetKeys: ["bar1d_raw"], ... }, alwaysCritical);
  assert.equal(await countOpenIncidents("bar1d_raw", "quality"), 1);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/data-governance/quality-runner.test.ts`
Expected: FAIL because checks and runner do not exist.

- [ ] **Step 3: Implement safe check adapters and persistence**

Each check returns `passed|warning|failed|error`, observed value and JSON details. Use parameterized SQL or existing repository helpers only. Critical failures call incident upsert; all results persist even when one rule errors.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/data-governance/quality-runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files**

```bash
git add apps/server/src/lib/data-governance/quality-checks.ts apps/server/src/lib/data-governance/quality-runner.ts apps/server/src/lib/data-governance/quality-runner.test.ts apps/server/src/lib/data-governance/incidents.ts
git commit -m "feat: persist executable data quality evidence"
```

### Task 7: Research Quality Gate

**Files:**
- Create: `apps/server/src/lib/data-governance/quality-gate.ts`
- Create: `apps/server/src/lib/data-governance/quality-gate.test.ts`
- Modify: `apps/server/src/api/backtests.ts`
- Modify: `apps/server/src/api/screens.ts`
- Modify: `apps/server/src/api/stock-analysis.ts`
- Modify: `apps/server/src/api/index.test.ts`
- Modify: `docs/data-pipeline.md`

**Interfaces:**
- Produces: `RESEARCH_CONSUMER_ASSETS`
- Produces: `buildResearchGateDecision(input): ResearchGateDecision`
- Produces: `assertResearchDataReady(consumer: ResearchConsumer): Promise<ResearchGateDecision>`
- Produces: `DataGovernanceGateError` with HTTP status `409`

- [ ] **Step 1: Write failing pure gate tests**

```ts
test("critical tier zero failure blocks research", () => {
  const decision = buildResearchGateDecision({
    consumer: "backtest",
    results: [{ assetKey: "bar1d_raw", tier: "tier_0", status: "failed", severity: "critical", checkedAt: "2026-11-19T09:00:00Z" }],
    incidents: [],
    now: new Date("2026-11-19T10:00:00Z"),
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.blockingAssetKeys[0], "bar1d_raw");
});

test("stale evidence is not treated as healthy", () => {
  const decision = buildResearchGateDecision({ ...fixture, evidenceSlaHours: 4, now: later });
  assert.equal(decision.allowed, false);
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/quality-gate.test.ts`
Expected: FAIL because gate decision does not exist.

- [ ] **Step 3: Implement consumer mapping and server gate**

Initial mappings:

- `backtest`: `trading_calendar`, `instrument`, `bar1d_raw`, `adj_factor`.
- `screening`: `trading_calendar`, `instrument`, `bar1d_raw`, `adj_factor`.
- `stock_analysis`: `trading_calendar`, `instrument`, `quote_latest`, `bar1d_raw`, `adj_factor`.

Tier 0 critical failures, unresolved critical incidents or missing/stale required evidence block in `enforce`; return warnings in `warn`; `off` skips blocking.

Document the gate modes, consumer asset mapping and user-visible `409` behavior in `docs/data-pipeline.md`.

- [ ] **Step 4: Integrate gate and verify route behavior**

Call `assertResearchDataReady()` before creating new backtest, screening and analysis work. Existing historical read pages MAY still render with warning.

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/quality-gate.test.ts src/api/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files**

```bash
git add apps/server/src/lib/data-governance/quality-gate.ts apps/server/src/lib/data-governance/quality-gate.test.ts apps/server/src/api/backtests.ts apps/server/src/api/screens.ts apps/server/src/api/stock-analysis.ts apps/server/src/api/index.test.ts docs/data-pipeline.md
git commit -m "feat: block research on critical data governance failures"
```

### Task 8: Governance Scan Worker

**Files:**
- Create: `apps/server/src/workers/sync-worker/governance-jobs.ts`
- Create: `apps/server/src/workers/sync-worker/governance-jobs.test.ts`
- Modify: `apps/server/src/workers/sync-worker/cron-config.ts`
- Modify: `apps/server/src/workers/sync-worker/index.ts`

**Interfaces:**
- Produces: `runGovernanceQualityScan(): Promise<void>`
- Produces cron job `governance-quality-scan`

- [ ] **Step 1: Write failing job tests**

```ts
test("governance quality scan is registered with a bounded schedule", () => {
  const governance = CRON_JOBS.find((job) => job.name === "governance-quality-scan");
  assert.equal(governance?.enabled, true);
  assert.equal(governance?.cron, "30 18 * * 1-5");
});

test("governance quality scan records job_run evidence", { skip: ... }, async () => {
  await runGovernanceQualityScan();
  assert.ok(await latestJobRun("governance-quality-scan"));
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/workers/sync-worker/governance-jobs.test.ts`
Expected: FAIL because governance jobs do not exist.

- [ ] **Step 3: Implement scheduling through `wrapJob`**

Schedule quality scan daily after market-close deadline and after successful manual sync. The job records in `job_run`; no raw payloads containing secrets.

- [ ] **Step 4: Run test to verify GREEN**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/workers/sync-worker/governance-jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files**

```bash
git add apps/server/src/workers/sync-worker/governance-jobs.ts apps/server/src/workers/sync-worker/governance-jobs.test.ts apps/server/src/workers/sync-worker/cron-config.ts apps/server/src/workers/sync-worker/index.ts
git commit -m "feat: schedule data governance scans"
```

### Task 9: Pin and Compare `a-stock-data`

**Files:**
- Create: `apps/server/src/lib/data-governance/source-standards.ts`
- Create: `apps/server/src/lib/data-governance/source-standard-monitor.ts`
- Create: `apps/server/src/lib/data-governance/source-standard-monitor.test.ts`
- Create: `docs/external/a-stock-data/<commit>/SKILL.md`
- Create: `docs/external/a-stock-data/<commit>/CHANGELOG.md`
- Create: `docs/external/a-stock-data/<commit>/metadata.json`
- Modify: `docs/standards/development-workflow.md`

**Interfaces:**
- Produces: `SourceStandardReference`
- Produces: `SourceStandardSnapshot = { commitSha: string; versionLabel: string; skillFileSha256: string; fetchedAt: string }`
- Produces: `getSourceStandardReference(id: "a-stock-data"): SourceStandardReference`
- Produces: `fetchLatestSourceStandardSnapshot(fetchImpl?): Promise<SourceStandardSnapshot>`
- Produces: `compareSourceStandard(reference, snapshot): "unchanged" | "changed"`

- [ ] **Step 1: Write failing monitor tests**

```ts
test("unchanged commit and checksum produce unchanged", async () => {
  const result = await fetchLatestSourceStandardSnapshot(async () => responseFixture);
  assert.equal(compareSourceStandard(reference, result), "unchanged");
});

test("changed commit or SKILL checksum produces changed", () => {
  assert.equal(compareSourceStandard(reference, { ...snapshot, commitSha: "new" }), "changed");
  assert.equal(compareSourceStandard(reference, { ...snapshot, skillFileSha256: "new" }), "changed");
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/source-standard-monitor.test.ts`
Expected: FAIL because monitor does not exist.

- [ ] **Step 3: Audit and pin the actual baseline**

Compare current Provider implementations and comments against the upstream changelog. Record the actual adopted version and commit; do not assume V3.6.0 or V3.7.1 is correct. Save the exact `SKILL.md`, `CHANGELOG.md`, `metadata.json`, commit SHA, version label and SHA-256.

Document the pin/check/Work Task/OpenSpec upgrade sequence in `docs/standards/development-workflow.md`.

- [ ] **Step 4: Implement GitHub API comparison with timeout**

Fetch latest commit from `https://api.github.com/repos/simonlin1212/a-stock-data/commits?per_page=1` and `SKILL.md` at that latest SHA. Use `AbortSignal.timeout(15_000)`, no authentication secret in logs, and distinguish unchanged/changed/unavailable in the caller.

- [ ] **Step 5: Run tests and verify snapshot integrity**

Run: `node --import @oxc-node/core/register --test src/lib/data-governance/source-standard-monitor.test.ts`
Expected: PASS.

Run: `shasum -a 256 docs/external/a-stock-data/<commit>/SKILL.md`
Expected: value matches `metadata.json`.

- [ ] **Step 6: Commit scoped files**

```bash
git add apps/server/src/lib/data-governance/source-standards.ts apps/server/src/lib/data-governance/source-standard-monitor.ts apps/server/src/lib/data-governance/source-standard-monitor.test.ts docs/external/a-stock-data docs/standards/development-workflow.md
git commit -m "feat: pin and monitor a-stock-data source standard"
```

### Task 10: Source Standard Watch Creates One Review Task

**Files:**
- Modify: `apps/server/src/workers/sync-worker/governance-jobs.ts`
- Modify: `apps/server/src/workers/sync-worker/governance-jobs.test.ts`
- Modify: `apps/server/src/workers/sync-worker/cron-config.ts`
- Modify: `apps/server/src/workers/sync-worker/index.ts`
- Modify: `apps/server/src/lib/data-governance/work-tasks.ts`
- Modify: `apps/server/src/lib/data-governance/work-tasks.test.ts`

**Interfaces:**
- Produces: `runSourceStandardWatch(): Promise<"unchanged" | "changed" | "unavailable">`
- Produces: `ensureSourceStandardReviewTask(input): Promise<number>`
- Work Task `relatedId` is the detected commit SHA; pending duplicate for that SHA returns the existing task ID.

- [ ] **Step 1: Write failing idempotency tests**

```ts
test("same changed source commit creates only one pending review task", async () => {
  const first = await ensureSourceStandardReviewTask({ commitSha: "abc", versionLabel: "v3.10.4", ... });
  const second = await ensureSourceStandardReviewTask({ commitSha: "abc", versionLabel: "v3.10.4", ... });
  assert.equal(first, second);
  assert.equal(await countPendingSourceReviewTasks("abc"), 1);
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/data-governance/work-tasks.test.ts src/workers/sync-worker/governance-jobs.test.ts`
Expected: FAIL because review task helper and source watch do not exist.

- [ ] **Step 3: Implement the watch job**

`changed` creates/returns one task; `unchanged` records success without a task; `unavailable` marks `job_run` failed and does not modify production references. Consecutive failures may open one governance incident after the configured threshold.

Register `source-standard-watch` with cron `0 3 * * *`; its result remains independent of trading-day guards.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/data-governance/work-tasks.test.ts src/workers/sync-worker/governance-jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files**

```bash
git add apps/server/src/workers/sync-worker/governance-jobs.ts apps/server/src/workers/sync-worker/governance-jobs.test.ts apps/server/src/workers/sync-worker/cron-config.ts apps/server/src/workers/sync-worker/index.ts apps/server/src/lib/data-governance/work-tasks.ts apps/server/src/lib/data-governance/work-tasks.test.ts
git commit -m "feat: create review tasks for source standard changes"
```

### Task 11: Governance API

**Files:**
- Create: `apps/server/src/api/governance.ts`
- Create: `apps/server/src/api/governance.test.ts`
- Modify: `apps/server/src/api/data-management.ts`

**Interfaces:**
- Produces: `createGovernanceRoute(resolveUser = getCurrentUser)`
- Produces protected `/api/v1/data-management/governance/*` routes from design.
- Read model functions: `listGovernanceAssets()`, `listQualityRules()`, `listQualityResults(filter)`, `listSourceStandards()`, `listWorkTasks(filter)`, `listIncidents(filter)`.

- [ ] **Step 1: Write failing API tests**

```ts
const userRoute = createGovernanceRoute(async () => userFixture);
const adminRoute = createGovernanceRoute(async () => adminFixture);

test("governance API requires super administrator", async () => {
  assert.equal((await userRoute.request("/assets")).status, 403);
  assert.equal((await adminRoute.request("/assets")).status, 200);
});

test("ordinary users never receive governance details", async () => {
  const response = await userRoute.request("/incidents");
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /bar1d_raw|a-stock-data/);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --import @oxc-node/core/register --test src/api/governance.test.ts`
Expected: FAIL because governance route does not exist.

- [ ] **Step 3: Implement read and controlled action routes**

Read endpoints join static registry metadata with runtime evidence. Work Task and incident actions validate current state and actor server-side; no route edits static metadata or accepts SQL.

- [ ] **Step 4: Mount under existing data management and verify GREEN**

Run: `node --import @oxc-node/core/register --test src/api/governance.test.ts src/api/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit scoped files**

```bash
git add apps/server/src/api/governance.ts apps/server/src/api/governance.test.ts apps/server/src/api/data-management.ts
git commit -m "feat: expose data governance console api"
```

### Task 12: Governance Console and Visual States

**Files:**
- Modify: `docs/design/prototypes/explorations/quant-workbench-data-governance-v1.html`
- Create: `apps/web/src/hooks/useDataGovernance.ts`
- Create: `apps/web/src/routes/home/data-management/governance/index.tsx`
- Create: `apps/web/src/routes/home/data-management/governance/assets.tsx`
- Create: `apps/web/src/routes/home/data-management/governance/quality.tsx`
- Create: `apps/web/src/routes/home/data-management/governance/source-standards.tsx`
- Create: `apps/web/src/routes/home/data-management/governance/work-tasks.tsx`
- Create: `apps/web/src/routes/home/data-management/governance/incidents.tsx`
- Modify: `apps/web/src/routes/home/data-management/route.tsx`
- Modify: `apps/web/src/lib/data-management-access.ts`
- Modify: `apps/web/src/lib/data-management-access.test.ts`
- Modify: `apps/web/src/lib/workbench-navigation.ts`
- Modify: `apps/web/src/lib/workbench-navigation.test.ts`
- Modify: `docs/standards/design.md`

**Interfaces:**
- Produces: `DataManagementSection = { label: string; href: string; icon: "overview" | "database" | "table" | "sync" | "quality" | "governance" | "audit"; exact?: boolean }`
- Produces: `getDataManagementSectionsForRole(role: unknown): readonly DataManagementSection[]`
- Produces hooks: `useGovernanceOverview()`, `useGovernanceAssets()`, `useQualityEvidence()`, `useSourceStandardStatus()`, `useGovernanceTasks()`, `useDataIncidents()`
- Produces mutations: `useTransitionGovernanceTask()`, `useTransitionIncident()`

- [ ] **Step 1: Verify the approved visual exploration**

Open the user-approved exploration and implement production UI from its hierarchy, spacing and states. Empty, loading, error, stale evidence and unauthorized states remain required even if not all appear in the first-screen exploration.

- [ ] **Step 2: Write failing navigation tests**

```ts
assert.equal(getWorkbenchPageTitle("/home/data-management/governance"), "数据治理");
assert.deepEqual(getDataManagementSectionsForRole("super_admin").map((item) => item.label), [
  "总览", "数据源", "数据表", "数据同步", "数据质量", "数据治理", "操作审计",
]);
```

- [ ] **Step 3: Run tests to verify RED**

Run: `node --test --experimental-strip-types src/lib/data-management-access.test.ts src/lib/workbench-navigation.test.ts`
Expected: FAIL because governance navigation is not registered.

- [ ] **Step 4: Implement hooks, routes and Preline pages**

Use existing `Card`, `Table`, `Badge`, `StatusDot`, `Button`, `Dialog` and semantic tokens. Static registry fields are read-only. Work Task and incident transitions require reason and confirmation.

Document the governance information architecture, read-only metadata rule and four-state visual QA requirement in `docs/standards/design.md`.

- [ ] **Step 5: Verify tests and build**

Run: `node --test --experimental-strip-types src/lib/data-management-access.test.ts src/lib/workbench-navigation.test.ts`
Expected: PASS.

Run: `../../node_modules/.bin/tsgo -b --noEmit`
Expected: PASS.

Run: `../../node_modules/.bin/vite build`
Expected: PASS.

- [ ] **Step 6: Capture desktop/mobile light/dark screenshots**

Run the project `oil-ui` screenshot flow against real governance pages. Expected: no horizontal overflow, console errors, contrast failures or hidden actions.

- [ ] **Step 7: Commit scoped files**

```bash
git add docs/design/prototypes/explorations/quant-workbench-data-governance-v1.html apps/web/src/hooks/useDataGovernance.ts apps/web/src/routes/home/data-management/governance apps/web/src/routes/home/data-management/route.tsx apps/web/src/lib/data-management-access.ts apps/web/src/lib/data-management-access.test.ts apps/web/src/lib/workbench-navigation.ts apps/web/src/lib/workbench-navigation.test.ts docs/standards/design.md
git commit -m "feat: add data governance console"
```

### Task 13: Standards, Rollout Gates and Final Verification

**Files:**
- Create: `openspec/changes/add-data-governance-baseline/verification.md`

- [ ] **Step 1: Verify stable docs match behavior**

Check the docs updated by Tasks 3, 7, 9 and 12 against the implemented behavior. Correct drift inside the task that owns the affected behavior before final verification.

- [ ] **Step 2: Verify repository provenance and generated docs**

Run: `shasum -a 256 docs/external/a-stock-data/<commit>/SKILL.md`
Expected: matches pinned metadata.

Run: `node --import @oxc-node/core/register apps/server/src/lib/data-governance/generate-docs.ts && git diff --check docs/data-governance/catalog.md`
Expected: deterministic output with no drift.

- [ ] **Step 3: Run full verification**

Run from `apps/server`:

```bash
node --import @oxc-node/core/register --test "src/**/*.test.ts"
../../node_modules/.bin/tsgo -b --noEmit
../../node_modules/.bin/oxlint .
ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/db/governance-schema.integration.ts src/lib/data-governance/incidents.test.ts src/lib/data-governance/work-tasks.test.ts src/lib/data-governance/quality-runner.test.ts
```

Run from `apps/web`:

```bash
node --test --experimental-strip-types
../../node_modules/.bin/tsgo -b --noEmit
../../node_modules/.bin/oxlint .
../../node_modules/.bin/vite build
```

Run from repository root:

```bash
node_modules/.bin/openspec validate add-data-governance-baseline --strict
```

Expected: all pass; database tests explicitly report pass counts.

- [ ] **Step 4: Validate rollout order**

Confirm `DATA_GOVERNANCE_GATE_MODE=warn` first, review false positives, then switch to `enforce`. Verify `off/warn/enforce` through automated tests. Record screenshots, skipped checks, current source-standard baseline and known limitations in `verification.md`.

- [ ] **Step 5: Commit documentation and verification**

```bash
git add openspec/changes/add-data-governance-baseline/verification.md
git commit -m "docs: complete data governance baseline verification"
```

## Workflow follow-up

- After all tasks pass, request one fresh whole-change code review.
- Fix all Critical and Important findings with tests.
- Archive the OpenSpec change and sync its delta specs into `openspec/specs/`.
- Do not auto-adopt any detected `a-stock-data` update; create a separate OpenSpec change when compatibility work is required.
