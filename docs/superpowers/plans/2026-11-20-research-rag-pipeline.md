# 研报 RAG 自动补全与检索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让任意个股分析自动补全最近 30 天研报全文与向量，并提供可降级、可引用、可验收的 Evidence Search 和 Agent RAG Answer。

**Architecture:** 新增独立 `research-worker` 消费 pg-boss durable queue。页面 GET 只读索引状态，页面通过独立 POST 入队元数据或研报任务；worker 全局串行调用现有 quant PDF/OCR/BGE 能力。API 和 Agent 共享同一检索服务，语义为空或失败时降级关键词。

**Tech Stack:** Hono、Drizzle、PostgreSQL/pgvector、pg-boss 10、React 19、TanStack Query、Preline、Tailwind、Python quant extraction。

**Spec:** `openspec/changes/archive/2026-11-20-complete-research-rag-pipeline/design.md`

**Detail Design:** `docs/superpowers/specs/2026-11-20-research-rag-pipeline-design.md`

## Global Constraints

- 新闻 RAG 保持禁用，`news_embedding` 不进入生产检索。
- 所有研报接口要求登录；页面 GET 不触发上游写请求。
- 最近 30 天全文自动补全，不做全市场无差别抓取。
- worker 全局并发必须为 1。
- 东财请求继续通过 quant Provider 和统一 `_em_get()`；server 不直连东财。
- 不改变行情 Provider 优先级、PIT 复权规则或 `load_kline` 契约。
- 不自动重试已进入 `failed` 的报告；page trigger 只处理 pending/未尝试项。
- 视觉门禁已确认：`docs/design/prototypes/explorations/quant-workbench-research-rag-v1.html`。
- UI 使用 Preline UI + Tailwind 语义 token；不在业务组件散落 raw hex。

## Review Focus

- worker 重启时 pending 文档可能永久悬挂；必须有重入队证据。
- failed 报告不能被每次打开页面自动重试；只有手动操作可再次入队。
- 语义检索“成功但零结果”不能被当作最终空结果；关键词降级必须触发。
- GET 分析接口不能触发上游请求；重复页面挂载不能造成请求风暴。
- 两个标的并发进入时仍只能同时处理一篇 PDF，当前请求优先。

---

### Task 1: Research Queue Contracts

**Files:**
- Create: `apps/server/src/services/research-index-contracts.ts`
- Create: `apps/server/src/services/research-queue.ts`
- Test: `apps/server/src/services/research-index-contracts.test.ts`

**Interfaces:**
- Produces: `type ResearchIndexJob = { kind: "metadata"; symbol: string; trigger: "analysis" | "manual" } | { kind: "report"; reportId: number; symbol: string; trigger: "analysis" | "manual" }`
- Produces: `RESEARCH_INDEX_QUEUE = "research-report-index"`
- Produces: `researchIndexJobOptions(job): { singletonKey; singletonSeconds; priority; retryLimit; retryDelay; retryBackoff }`
- Produces: `enqueueResearchIndexJob(job): Promise<string | null>`

- [ ] **Step 1: Write failing queue contract tests**

```ts
assert.deepEqual(researchIndexJobOptions({
  kind: "metadata",
  symbol: "002594.SZ",
  trigger: "analysis",
}), {
  singletonKey: "research-metadata:002594.SZ",
  singletonSeconds: 86400,
  priority: 10,
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
});
assert.equal(
  researchIndexJobOptions({
    kind: "report",
    reportId: 42,
    symbol: "002594.SZ",
    trigger: "analysis",
  }).singletonKey,
  "research-index:42:pymupdf+ocr-v1:v1",
);
```

- [ ] **Step 2: Run RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/services/research-index-contracts.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement contracts and pg-boss queue**

Metadata jobs use 24-hour singleton; report jobs use 10-minute singleton to suppress rapid duplicates while allowing manual retry after completion. Both use priority `10` for analysis/manual and `0` for background, retry limit 3, 60-second exponential backoff.

- [ ] **Step 4: Run GREEN**

Run the RED command.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/research-index-contracts.ts \
  apps/server/src/services/research-queue.ts \
  apps/server/src/services/research-index-contracts.test.ts
git commit -m "feat: add research indexing queue contracts"
```

### Task 2: Research Index Status and Processing Service

**Files:**
- Create: `apps/server/src/services/research-index-service.ts`
- Create: `apps/server/src/services/research-index-service.test.ts`
- Modify: `apps/server/src/services/stock-content-service.ts` only if a reusable report refresh export is needed

**Interfaces:**
- Consumes: `ResearchIndexJob`
- Produces: `type ResearchIndexStatus = { symbol; windowDays; total; pending; extracted; failed; action; observedAt }`
- Produces: `getResearchIndexStatus(symbol, days=30, now=new Date()): Promise<ResearchIndexStatus>`
- Produces: `prepareResearchIndexWindow(symbol, days=30): Promise<{ queued; skipped; failed }>`
- Produces: `processResearchReport(reportId, extract=quant.extractResearchReport): Promise<void>`
- Produces constants `RESEARCH_EXTRACTOR_VERSION`, `RESEARCH_CHUNK_VERSION`, `RESEARCH_EMBEDDING_MODEL`

- [ ] **Step 1: Write failing DB contract tests**

Cover:

```ts
assert.equal((await getResearchIndexStatus("000000.SZ")).action, "sync_metadata");
assert.deepEqual(await fixtureStatus({ failedOnly: 2 }), {
  total: 2,
  pending: 0,
  extracted: 0,
  failed: 2,
  action: "none",
});
assert.equal((await getResearchIndexStatus("600519.SH", 30)).action, "index_reports");
```

Also assert version mismatch and missing current chunks make an extracted report eligible for reindex.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && ADMIN_DB_TESTS=1 DATABASE_URL=postgres://ai-trader:aitrader123@localhost:5432/aitrader node --import @oxc-node/core/register --test src/services/research-index-service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement status aggregation and prepare**

Only count reports with PDF URL in the 30-day window. Missing document and `pending` are indexable automatically; `failed` is displayed but not auto-enqueued. `prepareResearchIndexWindow` inserts/reuses a `research_report_document` row with `extract_status=pending` and sends one report job per missing/stale report.

- [ ] **Step 4: Implement report processing**

Call quant extraction, then in one DB transaction upsert the document and replace current-version chunks. On error, persist/update `failed + last_error`, then rethrow so pg-boss can retry.

- [ ] **Step 5: Run GREEN**

Run the RED command.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/research-index-service.ts \
  apps/server/src/services/research-index-service.test.ts
git commit -m "feat: add research index status and processing"
```

### Task 3: Dedicated Research Worker and Recovery

**Files:**
- Create: `apps/server/src/workers/research-worker/index.ts`
- Create: `apps/server/src/workers/research-worker/processor.ts`
- Create: `apps/server/src/workers/research-worker/processor.test.ts`
- Modify: `apps/server/package.json`
- Modify: `docker-compose.yml`
- Modify: `deploy/start.sh`
- Modify: `deploy/stop.sh`

**Interfaces:**
- Consumes: `ResearchIndexJob`, `prepareResearchIndexWindow`, `processResearchReport`
- Produces: `processResearchIndexJob(job, deps?): Promise<void>`
- Produces: `requeuePendingResearchDocuments(now=new Date()): Promise<number>`
- Produces script `worker:research`

- [ ] **Step 1: Write failing processor tests**

Cover metadata and report dispatch:

```ts
await processResearchIndexJob(metadataJob, { syncMetadata, prepareWindow });
assert.equal(syncMetadataCalls, 1);
assert.equal(prepareWindowCalls, 1);

await processResearchIndexJob(reportJob, { processReport });
assert.deepEqual(processReportCalls, [42]);
```

Also assert one rejected report job is allowed to reject so pg-boss marks retry, without processing a second job in the same handler invocation.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/workers/research-worker/processor.test.ts`

Expected: FAIL because worker modules do not exist.

- [ ] **Step 3: Implement one serial queue handler**

Register exactly one `boss.work(RESEARCH_INDEX_QUEUE, { batchSize: 1, pollingIntervalSeconds: 2 }, ...)`. Dispatch by `kind`; do not register two queue handlers.

- [ ] **Step 4: Add recovery and deployment**

On startup and every 10 minutes, find documents `extract_status=pending` older than 10 minutes and re-enqueue them with a report singleton key. Add the worker container with `DATABASE_URL`, `QUANT_URL`, logging and no public port.

- [ ] **Step 5: Run GREEN**

Run the RED command.

Then run: `cd apps/server && ../../node_modules/.bin/tsgo -b --noEmit`

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/workers/research-worker \
  apps/server/package.json docker-compose.yml deploy/start.sh deploy/stop.sh
git commit -m "feat: add dedicated research worker"
```

### Task 4: Index Trigger and Analysis API

**Files:**
- Modify: `apps/server/src/api/research-reports.ts`
- Modify: `apps/server/src/api/stock-analysis.ts`
- Modify: `apps/server/src/api/index.test.ts`
- Create: `apps/server/src/api/research-index.test.ts`

**Interfaces:**
- Consumes: `getResearchIndexStatus`, `prepareResearchIndexWindow`, `enqueueResearchIndexJob`
- Adds: `POST /api/v1/research-reports/index-window` body `{ symbol: string; days?: 30 }`
- Adds: `reportIndex` to `GET /api/v1/stock-analysis/:symbol`
- Changes: `POST /api/v1/research-reports/:id/ingest` to `202` queue submission

- [ ] **Step 1: Write failing API tests**

```ts
const status = await api.request("/stock-analysis/002594.SZ");
assert.ok((await status.json()).data.reportIndex);

const enqueue = await api.request("/research-reports/index-window", {
  method: "POST",
  body: JSON.stringify({ symbol: "002594.SZ" }),
});
assert.equal(enqueue.status, 202);
```

Cover missing symbol, invalid symbol, unauthenticated request, metadata action and report action.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && ADMIN_DB_TESTS=1 DATABASE_URL=postgres://ai-trader:aitrader123@localhost:5432/aitrader node --import @oxc-node/core/register --test src/api/index.test.ts src/api/research-index.test.ts`

Expected: FAIL because routes/fields do not exist.

- [ ] **Step 3: Implement readonly status and POST enqueue**

Keep GET side-effect free. `POST` normalizes the symbol, limits days to 30 for this release, enqueues metadata when needed, otherwise prepares report jobs. Single ingest uses the same queue and returns `202`.

- [ ] **Step 4: Run GREEN**

Run the RED command.

Then run: `cd apps/server && ../../node_modules/.bin/tsgo -b --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/api/research-reports.ts \
  apps/server/src/api/stock-analysis.ts apps/server/src/api/index.test.ts \
  apps/server/src/api/research-index.test.ts
git commit -m "feat: expose research index status and trigger"
```

### Task 5: Shared Hybrid Retrieval

**Files:**
- Create: `apps/server/src/services/research-evidence-service.ts`
- Create: `apps/server/src/services/research-evidence-service.test.ts`
- Modify: `apps/server/src/api/research-reports.ts`
- Modify: `apps/server/src/agent/mastra/tools/research-report-tool.ts`

**Interfaces:**
- Produces: `searchResearchEvidence({ symbol, query, asOf?, limit }, deps?): Promise<{ mode: "semantic" | "keyword"; model: string | null; items: ResearchEvidenceItem[] }>`
- `ResearchEvidenceItem = { reportId; title; institution; publishDate; pdfUrl; pageFrom; pageTo; sectionTitle; excerpt; similarity }`
- API uses limit 8; Agent uses limit 5.

- [ ] **Step 1: Write failing retrieval tests**

Cover:

```ts
assert.equal((await searchResearchEvidence(input, { embed: throws, execute: keywordRows })).mode, "keyword");
assert.equal((await searchResearchEvidence(input, { embed: ok, execute: emptyVectorRows })).mode, "keyword");
assert.equal((await searchResearchEvidence(input, { embed: ok, execute: semanticRows })).items[0].similarity, 0.82);
```

Also verify `asOf` is added to both semantic and keyword SQL.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && ADMIN_DB_TESTS=1 DATABASE_URL=postgres://ai-trader:aitrader123@localhost:5432/aitrader node --import @oxc-node/core/register --test src/services/research-evidence-service.test.ts`

Expected: FAIL because the shared service does not exist.

- [ ] **Step 3: Implement and rewire both callers**

Move duplicated SQL into the service. Empty semantic results trigger keyword fallback. Both API and Agent map the same service result to their existing response shape.

- [ ] **Step 4: Run GREEN**

Run the RED command and: `cd apps/server && ../../node_modules/.bin/tsgo -b --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/research-evidence-service.ts \
  apps/server/src/services/research-evidence-service.test.ts \
  apps/server/src/api/research-reports.ts \
  apps/server/src/agent/mastra/tools/research-report-tool.ts
git commit -m "fix: unify research evidence fallback"
```

### Task 6: Stock Analysis Index Status UI

**Files:**
- Modify: `apps/web/src/hooks/useStockAnalysis.ts`
- Modify: `apps/web/src/lib/stock-analysis.ts`
- Modify: `apps/web/src/lib/stock-analysis.test.ts`
- Modify: `apps/web/src/routes/home/market/analysis/-private/StockAnalysisDetail.tsx`
- Modify: `apps/web/src/routes/home/market/analysis/$symbol.tsx` only if remount behavior regresses

**Interfaces:**
- Consumes: `reportIndex` from analysis response and `POST /research-reports/index-window`
- Produces: `formatResearchIndexStatus(status): { label; tone; detail }`
- Produces: `shouldTriggerResearchIndex(status): boolean`
- Produces: `researchIndexRefetchInterval(status): number | false`

- [ ] **Step 1: Write failing frontend formatter tests**

```ts
assert.deepEqual(formatResearchIndexStatus(empty), {
  label: "暂无全文",
  tone: "neutral",
  detail: "当前只有研报元数据",
});
assert.equal(formatResearchIndexStatus(partial).label, "已索引 5 篇 · 2 失败");
assert.equal(shouldTriggerResearchIndex({ action: "none", failed: 2 }), false);
assert.equal(researchIndexRefetchInterval({ pending: 2 }), 3000);
```

Also cover pending, running, success, failed-only and metadata sync.

- [ ] **Step 2: Run RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/stock-analysis.test.ts`

Expected: FAIL because the formatter/helpers do not exist.

- [ ] **Step 3: Implement hook and page**

Add `reportIndex` to `StockAnalysisResponse`, a trigger mutation and 3-second polling only while pending. In the page, use a ref keyed by symbol to submit at most one automatic trigger per mount/action. Reuse the fifth status cell from the confirmed prototype and render partial failure through the existing alert.

- [ ] **Step 4: Run GREEN**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/stock-analysis.test.ts`

Run: `cd apps/web && ../../node_modules/.bin/tsgo -b --noEmit`

Run: `cd apps/web && ../../node_modules/.bin/oxlint .`

- [ ] **Step 5: Visual verification**

Capture desktop/mobile and light/dark screenshots for empty, pending, running, success, partial failure and Evidence Search empty. Compare with `docs/design/prototypes/explorations/quant-workbench-research-rag-v1.html`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useStockAnalysis.ts \
  apps/web/src/lib/stock-analysis.ts apps/web/src/lib/stock-analysis.test.ts \
  apps/web/src/routes/home/market/analysis/-private/StockAnalysisDetail.tsx
git commit -m "feat: show research index status"
```

### Task 7: Golden Set and Evaluation

**Files:**
- Create: `apps/server/src/services/research-evidence-evaluation.ts`
- Create: `apps/server/src/services/research-evidence-evaluation.test.ts`
- Create: `apps/server/src/agent/mastra/fixtures/research-rag-golden-set.json`
- Create: `apps/server/scripts/evaluate-research-rag.ts`
- Modify: `apps/server/package.json`

**Interfaces:**
- Fixture item: `{ id; symbol; query; asOf?: string; expectedSourceIds: string[]; expectedPages?: number[]; forbiddenSourceIds?: string[] }`
- `evaluateResearchEvidence(fixture, retrieve): Promise<{ passed; failed; results }>`
- Script prints recall, fallback mode, citation validity and failed cases.

- [ ] **Step 1: Write failing evaluator tests**

Cover a passing query, wrong expected source, leaked forbidden source, future `asOf`, and a result that must use keyword fallback.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/services/research-evidence-evaluation.test.ts`

Expected: FAIL because the evaluator does not exist.

- [ ] **Step 3: Implement evaluator and fixture schema**

Write 20+ entries across `002594.SZ` and `600519.SH`. Keep evaluator independent from live network by injecting retrieval.

- [ ] **Step 4: Run GREEN**

Run the RED command.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/research-evidence-evaluation.ts \
  apps/server/src/services/research-evidence-evaluation.test.ts \
  apps/server/src/agent/mastra/fixtures/research-rag-golden-set.json \
  apps/server/scripts/evaluate-research-rag.ts apps/server/package.json
git commit -m "test: add research rag golden set"
```

### Task 8: Integration Verification and Documentation

**Files:**
- Create: `openspec/changes/archive/2026-11-20-complete-research-rag-pipeline/verification.md`
- Modify: `docs/standards/rag.md`
- Modify: `docs/data-pipeline.md`
- Modify: `docs/runbooks.md`

**Interfaces:**
- Consumes: Tasks 1–7.

- [ ] **Step 1: Run full checks**

Run quant tests, server unit tests, DB tests, web tests, both type checks, both linters, Vite build, and `openspec validate complete-research-rag-pipeline --strict`.

- [ ] **Step 2: Verify real ingestion**

Use `002594.SZ` and `600519.SH`. Record metadata counts, last-30-day report count, PDF success/failure, chunk count, vector count, Evidence Search modes and citations.

- [ ] **Step 3: Verify failure and recovery**

Stop the worker during a pending report and confirm it is re-enqueued. Force one report extraction failure and confirm partial failure does not block other reports or page rendering.

- [ ] **Step 4: Write verification report**

Record commands, counts, migration/rollback notes, screenshots, Golden Set metrics and known limitations. Explicitly record news RAG as not applicable.

- [ ] **Step 5: Commit**

```bash
git add openspec/changes/archive/2026-11-20-complete-research-rag-pipeline/verification.md \
  docs/standards/rag.md docs/data-pipeline.md docs/runbooks.md
git commit -m "docs: verify research rag pipeline"
```

## Plan Self-Review

- Spec coverage: queue, metadata, index status, automatic fulltext, retrieval fallback, Agent citations, UI and Golden Set each have an owning task.
- Interface consistency: `ResearchIndexJob`, `ResearchIndexStatus`, `ResearchEvidenceItem` are introduced once and reused.
- Failure coverage: worker restart, failed-only no auto retry, semantic empty fallback, duplicate page triggers and global concurrency 1 are explicit.
