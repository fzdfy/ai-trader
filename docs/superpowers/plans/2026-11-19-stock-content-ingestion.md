# 个股新闻、公告与研报采集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为自选股和任意分析标的提供幂等、可降级、可治理的个股新闻、公告与研报同步链路。

**Architecture:** 新闻和公告通过 quant Provider 统一上游与降级，server 负责落库、显式标的关系和任务编排。研报复用现有 Provider；数据管理、质量和个股分析复用现有注册表与页面组件。

**Tech Stack:** Python FastAPI、Pydantic、unittest、Hono、Drizzle ORM、PostgreSQL、React 19、TanStack Query、Preline UI、Node test runner。

**Spec:** `openspec/changes/add-stock-content-ingestion/design.md`

## Global Constraints

- 所有东财内容请求必须经过 `_em_get()` 或其同步实现，禁止在 TypeScript 管道直接请求东财。
- 新闻主源东财、备源新浪；公告主源巨潮、备源东财；研报沿用东财 Provider。
- 首次窗口固定为每只自选股新闻 20 条、公告 30 天、研报 12 个月。
- 内容质量全部为 Tier 1 warning，不参与研究阻断。
- 普通用户不得访问数据管理治理详情。
- 不改变行情 Provider 优先级、PIT 复权规则或 `load_kline` 输出契约。
- 工作区已有大量暂存改动；每个任务只修改计划列出的文件，禁止 `git add -A`。
- 行为变化必须先看到 RED，再实现 GREEN；数据库用例使用 `ADMIN_DB_TESTS=1`。

## Review Focus

- 主源被风控返回空时，备源失败不得清空既有新闻、公告或研报。
- 无股票代码的个股新闻必须关联当前标的；重复同步不得重复关联。
- 新闻、公告、研报任一刷新失败时，其余模块与行情分析仍必须可用。
- 公告唯一约束迁移遇到历史重复行时必须可预测收敛，不得让迁移随机失败。
- 非自选股必须能按需刷新，但定时任务不得退化为全市场抓取。

---

### Task 1: Quant Content Models and Provider Contracts

**Files:**
- Modify: `apps/quant/data/schemas.py`
- Modify: `apps/quant/data/base.py`
- Modify: `apps/quant/data/registry.py`
- Modify: `apps/quant/data/providers/__init__.py`
- Test: `apps/quant/tests/test_content_providers.py`

**Interfaces:**
- Produces: `NewsItem(source: str, title: str, content: str | None, url: str, published_at: str | None, related_symbols: list[str])`
- Produces: `AnnouncementItem(source: str, title: str, announcement_type: str | None, published_at: str, url: str, pdf_url: str | None)`
- Produces capabilities `stock_news`, `market_news`, `announcement`
- Produces methods `MarketProvider.stock_news(symbol, page_size=20)`, `market_news(limit=50)`, `announcements(symbol, since_days=30, page_size=30)`

- [ ] **Step 1: Write failing schema and registry tests**

Test that news preserves `related_symbols`, announcement preserves `published_at/pdf_url`, and registry chains are `stock_news: eastmoney→sina`, `market_news: eastmoney`, `announcement: cninfo→eastmoney`.

- [ ] **Step 2: Run RED**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_content_providers.py' -v`
Expected: FAIL because models, capabilities and methods do not exist.

- [ ] **Step 3: Implement models, capability constants, base methods and registry entries**

Use Pydantic models with snake_case; providers that do not support a capability continue raising `NotImplementedError`.

- [ ] **Step 4: Run GREEN**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_content_providers.py' -v`
Expected: PASS.

### Task 2: Eastmoney, Sina and CNInfo Content Providers

**Files:**
- Create: `apps/quant/data/providers/cninfo/__init__.py`
- Create: `apps/quant/data/providers/cninfo/provider.py`
- Modify: `apps/quant/data/providers/eastmoney/provider.py`
- Modify: `apps/quant/data/providers/sina/provider.py`
- Modify: `apps/quant/data/providers/__init__.py`
- Test: `apps/quant/tests/test_content_providers.py`

**Interfaces:**
- Consumes: `NewsItem`, `AnnouncementItem` and provider capabilities from Task 1.
- Produces: Eastmoney `stock_news`, `market_news`, `announcements`
- Produces: Sina `stock_news`
- Produces: CNInfo provider name `cninfo` with `announcements`

- [ ] **Step 1: Add failing parser and fallback tests**

Cover Eastmoney JSONP `cmsArticleWebOld`, Sina `ext.stocks` filtering, Eastmoney announcement list, CNInfo `announcements` + orgId cache, and `call_with_fallback` moving from CNInfo to Eastmoney after failure.

- [ ] **Step 2: Run RED**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_content_providers.py' -v`
Expected: FAIL on unimplemented provider methods.

- [ ] **Step 3: Implement providers**

Eastmoney uses `_em_get` for JSON endpoints and `_em_get_bytes` + JSONP extraction for stock news. Sina requests `zhibo_id=152`, parses `ext.stocks`, and filters `cn` symbols. CNInfo dynamically resolves `orgId`, falls back to `gs{prefix}0{code}`, and uses POST form data.

- [ ] **Step 4: Run GREEN**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_content_providers.py' -v`
Expected: PASS without real network calls.

### Task 3: Quant Content APIs and Server Client

**Files:**
- Modify: `apps/quant/data/router.py`
- Modify: `apps/server/src/lib/quant.ts`
- Test: `apps/quant/tests/test_content_providers.py`
- Test: `apps/server/src/lib/quant-content-contracts.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/data/stock-news?symbol&page_size&source`
- Produces: `GET /api/v1/data/market-news?limit&source`
- Produces: `GET /api/v1/data/announcements?symbol&since_days&page_size&source`
- Produces: `quant.stockNews`, `quant.marketNews`, `quant.announcements`

- [ ] **Step 1: Write failing route and TypeScript contract tests**

Route validation covers symbol normalization, page limits 1–100, announcement window 1–365, explicit unsupported source returning 400. TypeScript contract accepts snake_case items.

- [ ] **Step 2: Run RED**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_content_providers.py' -v`
Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/quant-content-contracts.test.ts`
Expected: FAIL because routes/client methods do not exist.

- [ ] **Step 3: Implement router endpoints and typed client methods**

Endpoints use `_pick` and `registry.call_with_fallback`; upstream failures map to 502, invalid input to 400.

- [ ] **Step 4: Run GREEN**

Run both RED commands again.
Expected: PASS.

### Task 4: Announcement Identity Migration

**Files:**
- Modify: `apps/server/src/db/schema/stock-analysis.ts`
- Create: `apps/server/migrations/0037_stock_content_ingestion.sql`
- Create: `apps/server/migrations/meta/0037_snapshot.json`
- Modify: `apps/server/migrations/meta/_journal.json`
- Test: `apps/server/src/db/content-schema.integration.ts`

**Interfaces:**
- Produces: unique index `company_announcement_source_url_unq` on `(source, source_url)`
- Consumes: existing `company_announcement` rows.

- [ ] **Step 1: Write failing unique-constraint integration test**

Insert one announcement, assert the same `(source, source_url)` pair conflicts, and assert the same URL from a different source is allowed.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/db/content-schema.integration.ts`
Expected: FAIL because no unique constraint exists.

- [ ] **Step 3: Add migration**

Before creating the unique index, delete older duplicates with a deterministic `a.id < b.id` rule; preserve the newest row. Add the Drizzle unique index and generated metadata.

- [ ] **Step 4: Apply migration and run GREEN**

Run: `cd apps/server && ../../node_modules/.bin/drizzle-kit migrate`
Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/db/content-schema.integration.ts`
Expected: migration succeeds; test passes.

### Task 5: Server Content Ingestion Service and Refresh API

**Files:**
- Create: `apps/server/src/services/stock-content-service.ts`
- Create: `apps/server/src/services/stock-content-service.test.ts`
- Modify: `apps/server/src/api/stock-analysis.ts`
- Modify: `apps/server/src/api/index.test.ts`

**Interfaces:**
- Produces: `type ContentModuleResult = { ok: boolean; inserted: number; total: number; observedAt: string; error: string | null }`
- Produces: `syncStockNews(symbol: string): Promise<ContentModuleResult>`
- Produces: `syncStockAnnouncements(symbol: string): Promise<ContentModuleResult>`
- Produces: `syncStockResearchReports(symbol: string): Promise<ContentModuleResult>`
- Produces: `syncStockContent(symbol: string): Promise<{ symbol; news; announcements; reports }>`
- Changes: `POST /stock-analysis/:symbol/refresh` returns `{ symbol, modules: { news, announcements, reports } }`

- [ ] **Step 1: Write failing service tests**

Cover no-code article linked to queried symbol, multi-symbol association, duplicate article/association, duplicate announcement, 12-month report boundary, and one failed module not cancelling others.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/services/stock-content-service.test.ts`
Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement ingestion and aggregation**

Use `Promise.allSettled` for modules. News upsert always includes the queried symbol and merges recognized symbols; existing articles still receive missing associations. Announcements upsert on `(source, source_url)`. Reports use existing 12-month Provider range.

- [ ] **Step 4: Integrate refresh route**

Keep auth and governance warning behavior; return 200 with per-module failures instead of failing the whole refresh when one upstream fails.

- [ ] **Step 5: Run GREEN**

Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/services/stock-content-service.test.ts src/api/index.test.ts`
Expected: PASS.

### Task 6: Scheduled Watchlist Synchronization

**Files:**
- Create: `apps/server/src/workers/sync-worker/stock-content-jobs.ts`
- Create: `apps/server/src/workers/sync-worker/stock-content-jobs.test.ts`
- Modify: `apps/server/src/workers/sync-worker/pipes/news.ts`
- Modify: `apps/server/src/workers/sync-worker/runner.ts`
- Modify: `apps/server/src/workers/sync-worker/cron-config.ts`
- Modify: `apps/server/src/api/sync.ts`

**Interfaces:**
- Produces: `runStockAnnouncementSync(): Promise<void>`
- Produces: `runStockResearchReportSync(): Promise<void>`
- Produces cron jobs `stock-announcements` at `5 18 * * 1-5`, `stock-research-reports` at `10 18 * * 1-5`
- Changes: `newsPipeRun` calls `quant.stockNews` and shared news ingestion rather than direct Eastmoney stock searches.

- [ ] **Step 1: Write failing worker tests**

Assert watchlist-only selection, 30-day/12-month boundaries, one-symbol failure continuing to next symbol, job-run evidence, and no all-market fallback.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/workers/sync-worker/stock-content-jobs.test.ts`
Expected: FAIL because jobs do not exist.

- [ ] **Step 3: Implement jobs and register schedules**

Use existing `wrapJob`/`updateProgress`; process watchlist serially; aggregate failures at end so `job_run` reflects partial failure.

- [ ] **Step 4: Run GREEN**

Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/workers/sync-worker/stock-content-jobs.test.ts src/workers/sync-worker/governance-jobs.test.ts`
Expected: PASS.

### Task 7: Data Management and Tier 1 Quality

**Files:**
- Modify: `apps/server/src/api/data-center.ts`
- Modify: `apps/server/src/lib/data-governance/registry.ts`
- Modify: `apps/server/src/lib/data-governance/quality-rules.ts`
- Modify: `apps/server/src/lib/data-governance/quality-checks.ts`
- Modify: `apps/server/src/lib/data-governance/quality-rules.test.ts`
- Modify: `apps/server/src/lib/data-governance/quality-checks.test.ts`
- Modify: `docs/data-governance/catalog.md`

**Interfaces:**
- Produces check keys `coverage.symbol_links` and `validity.research_documents`
- Adds all 10 content assets to `DATA_CENTER_TABLES`
- Produces warning rules for news, announcements and reports

- [ ] **Step 1: Write failing metadata and quality tests**

Cover all 10 table names in `DATA_CENTER_TABLES`, source-chain metadata, primary keys in governance contracts, zero linked news, incomplete PDF extraction, and warning-only severity.

- [ ] **Step 2: Run RED**

Run: `cd apps/server && ADMIN_DB_TESTS=1 node --import @oxc-node/core/register --test src/lib/data-governance/quality-rules.test.ts src/lib/data-governance/quality-checks.test.ts`
Expected: FAIL because content checks/tables are missing.

- [ ] **Step 3: Implement table metadata, governance contracts and checks**

Primary tables expose external sources; derived tables expose upstream/producer jobs. Freshness uses fetch/ingestion timestamps where publication frequency is sparse. All content rules use `severity: warning`.

- [ ] **Step 4: Regenerate catalog and run GREEN**

Run: `node --import @oxc-node/core/register apps/server/src/lib/data-governance/generate-docs.ts`
Run quality tests and `scripts/check-governance.ts`.
Expected: PASS and catalog current.

### Task 8: Stock Analysis UI Refresh States

**Files:**
- Modify: `apps/web/src/hooks/useStockAnalysis.ts`
- Modify: `apps/web/src/routes/home/market/analysis/-private/StockAnalysisDetail.tsx`
- Modify: `apps/web/src/lib/stock-analysis.ts`
- Modify: `apps/web/src/lib/stock-analysis.test.ts`

**Interfaces:**
- Consumes: `POST /stock-analysis/:symbol/refresh` module result from Task 5.
- Produces: `ContentRefreshSummary` and a formatter mapping module status to user-facing label/tone.

- [ ] **Step 1: Write failing formatting tests**

Cover all success, partial failure, all failure, and missing/empty results without claiming full success.

- [ ] **Step 2: Run RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/stock-analysis.test.ts`
Expected: FAIL because formatter does not exist.

- [ ] **Step 3: Implement hook and compact refresh result**

Keep one “重新分析” button. Add a compact status row near the page header showing news/公告/研报 counts and errors. Invalidate stock analysis query after success.

- [ ] **Step 4: Run GREEN and visual checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/stock-analysis.test.ts`
Run: `cd apps/web && ../../node_modules/.bin/tsgo -b --noEmit`
Capture desktop/mobile light/dark screenshots for partial failure.

### Task 9: Integration Verification

**Files:**
- Create: `openspec/changes/add-stock-content-ingestion/verification.md`
- Modify: `docs/data-pipeline.md`
- Modify: `docs/standards/database.md`
- Modify: `docs/standards/design.md`

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: evidence report and migration/rollback notes.

- [ ] **Step 1: Run full checks**

Run quant tests, server full tests, server DB content tests, web tests, both type checks, both linters, Vite build, and OpenSpec strict validation.

- [ ] **Step 2: Verify real provider behavior**

Use a current A-share symbol to verify Eastmoney news, Sina fallback parser, CNInfo announcement, Eastmoney announcement fallback, and Eastmoney report. Record network failures as unavailable rather than converting them to empty success.

- [ ] **Step 3: Verify end-to-end state**

Run “重新分析” for one watchlist stock and one non-watchlist stock; verify counts, source labels, module states, database associations, quality results, and management directory entries.

- [ ] **Step 4: Write verification report and update docs**

Record commands, pass counts, skipped/network-only checks, screenshots, migration behavior and `warn` quality boundary.

## Review Focus Coverage

- Empty/failed upstream does not delete existing data → Tasks 5 and 6.
- No-code news links to queried symbol → Task 5.
- Partial module failure remains usable → Tasks 5 and 8.
- Duplicate announcement migration → Task 4.
- Non-watchlist on demand and no all-market schedule → Tasks 5 and 6.

