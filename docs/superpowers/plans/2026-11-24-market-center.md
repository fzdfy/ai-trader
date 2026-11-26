# 行情中心 End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已确认的行情中心视觉稿交付三模块生产页面，并为板块轮动、异动和详情资金结构提供真实、可降级的数据。

**Architecture:** 指数轮动数据通过独立 Provider 日线接口进入 Server 的只读轮动服务；行业/概念轮动复用板块历史和资金流快照，大类资产轮动复用 `market_asset_daily_bar`。前端保持“总览 / 板块 / 个股”三个一级模块，板块页同屏展示排行、热力图、轮动和异动，个股详情继续使用现有 `klinecharts`。

**Tech Stack:** Python FastAPI + unittest、Hono + Drizzle + node:test、React 19 + TanStack Router/Query + Preline + Tailwind。

**Spec:** `openspec/changes/add-market-center/specs/market-center/spec.md`、`openspec/changes/add-market-center/specs/market-rotation/spec.md`

## Global Constraints

- 一级模块只允许“总览、板块、个股”，不得增加“轮动”或“资金与异动”一级 Tab。
- 板块页不得增加轮动/异动二级 Tab；第一层为当前排行和热力图，第二层为轮动和异动。
- 个股列表点击后进入现有 `/home/market/stock/$symbol` K 线详情；详情内增加资金结构，不重写 K 线框架。
- 页面使用 Preline 语义组件和语义颜色 token，不散落 raw hex。
- 无数据、部分失败和过期数据必须显式展示，不得伪造行情或 0 值。
- 修改涉及 `apps/web/src/routes/home/-private/DailyDashboard.tsx` 以外的共享文件时，保留现有脏工作区改动；不提交、不 reset。

## Review Focus

- 930955 和 399673 某一源缺失时，成长/防守轮动必须显示部分失败，不影响行业、概念和个股模块。
- 板块只有很短历史时不得伪造 20 日排名变化。
- 主力净流入必须与大/超大/中/小单结构分开命名，不能被描述成全部资金。
- 移动端板块页第二层必须在排行/热力图之后按轮动、异动顺序自然排列。
- 点击板块行必须进入详情页，不能回到之前的侧边或底部详情卡。

---

### Task 1: 指数轮动 Provider

**Files:**
- Create: `apps/quant/data/index_rotation.py`
- Create: `apps/quant/tests/test_index_rotation.py`
- Modify: `apps/quant/data/__init__.py`

**Interfaces:**
- Produces: `fetch_rotation_index_daily(index_code: str, start: str, end: str) -> list[dict]`
- Produces: `fetch_growth_defense_history(start: str, end: str) -> list[IndexRotationDaily]`

- [ ] **Step 1: Write failing parser/provider tests**

```python
def test_parses_csindex_930955_daily():
    bars = parse_csindex_daily(payload, "930955")
    assert bars[0].trade_date == "2026-11-23"
    assert bars[0].close == 11656.23

def test_parses_tencent_399673_daily():
    bars = parse_tencent_index_daily(payload, "399673.SZ")
    assert bars[0].symbol == "399673.SZ"
    assert bars[0].close == 2453.47
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd apps/quant && uv run python -m unittest tests.test_index_rotation -v`

Expected: FAIL because parser functions do not exist.

- [ ] **Step 3: Implement the two parsers and source fetch functions**

Use `https://www.csindex.com.cn/csindex-home/perf/index-perf` with `indexCode`, `startDate`, `endDate` in `YYYYMMDD`; use the existing Tencent K-line request for `sz399673`, `adjust="none"`. Sort ascending and reject empty/malformed payloads.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `cd apps/quant && uv run python -m unittest tests.test_index_rotation -v`

Expected: PASS.

### Task 2: Rotation Storage and Ingestion

**Files:**
- Create: `apps/server/src/db/schema/market-rotation.ts`
- Modify: `apps/server/src/db/schema/index.ts`
- Create: `apps/server/src/lib/market-rotation/store.ts`
- Create: `apps/server/src/workers/sync-worker/pipes/rotation-indices.ts`
- Create: `apps/server/src/lib/market-rotation/store.test.ts`
- Modify: `apps/server/src/lib/quant.ts`
- Add: generated Drizzle migration

**Interfaces:**
- Consumes: quant endpoint data from Task 1.
- Produces: `upsertRotationIndexBars(values)` and `readRotationIndexBars(codes, start, end)`.
- Produces: quant method `rotationIndexDaily(start, end)`.

- [ ] **Step 1: Write a failing store contract test**

Assert duplicate `(symbol, tradeDate)` rows upsert to one row and preserve source/time; assert unknown `900000` is rejected by catalog.

- [ ] **Step 2: Run the test and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-rotation/store.test.ts`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Add table, catalog, and ingestion**

Create `rotation_index_daily_bar(symbol, trade_date, open, high, low, close, source, observed_at)` with primary key `(symbol, trade_date)`. Add sync pipe for `399673.SZ` and `930955.CSI`, idempotent upsert, and daily schedule. Do not write these symbols into `bar1d_raw`.

- [ ] **Step 4: Run test and schema checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-rotation/store.test.ts && pnpm check-types`

Expected: PASS.

### Task 3: Rotation and Overview API

**Files:**
- Create: `apps/server/src/lib/market-rotation/compute.ts`
- Create: `apps/server/src/lib/market-rotation/compute.test.ts`
- Create: `apps/server/src/lib/market-center/overview.ts`
- Create: `apps/server/src/api/market-center.ts`
- Create: `apps/server/src/api/market-center.test.ts`
- Modify: `apps/server/src/api/index.ts`
- Modify: `apps/server/src/lib/system-features.ts`

**Interfaces:**
- Produces: `GET /api/v1/market-center/overview`
- Produces: `GET /api/v1/market-center/rotation?scope=growth-defense|industry|concept|asset&window=5D|20D|60D`
- Produces: `MarketCenterOverviewResponse` and `MarketRotationResponse`.

- [ ] **Step 1: Write failing pure computation tests**

Cover unavailable history, 20-day rank change, invalid scope/window, and section status values.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-rotation/compute.test.ts src/api/market-center.test.ts`

Expected: FAIL because modules/routes do not exist.

- [ ] **Step 3: Implement route and partial-success semantics**

Overview returns quotes, breadth, limit-up summary and section statuses. Rotation returns normalized relative return, rank/rank change and phase; use `board_history`, `fund_flow_rank`, `market_asset_daily_bar`, and rotation table as appropriate. At least one section works => 200; all fail => 503.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-rotation/compute.test.ts src/api/market-center.test.ts`

Expected: PASS.

### Task 4: Web Types, Hooks, and Navigation

**Files:**
- Create: `apps/web/src/lib/market-center.ts`
- Create: `apps/web/src/lib/market-center.test.ts`
- Create: `apps/web/src/hooks/useMarketCenter.ts`
- Modify: `apps/web/src/lib/workbench-navigation.ts`
- Modify: `apps/web/src/lib/workbench-navigation.test.ts`
- Modify: `apps/web/src/lib/market-brief.ts`
- Modify: `apps/web/src/hooks/useSystemFeatures.ts`

**Interfaces:**
- Produces: typed query params/hooks for overview and rotation.
- Produces: page titles and breadcrumbs for board/stock details.

- [ ] **Step 1: Write failing helper/navigation tests**

Cover three-module order, `/home/market/boards/BK1036` breadcrumbs, section quality formatting, and feature flag behavior.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && npm test -- --test-name-pattern "market center"`

Expected: FAIL because the new helpers do not exist.

- [ ] **Step 3: Implement types, hooks, and navigation**

Hooks use TanStack Query, `AbortSignal`, stable keys, and no user data. Add `marketCenter` to system features and typed page titles/breadcrumbs.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `cd apps/web && npm test -- --test-name-pattern "market center" && pnpm check-types`

Expected: PASS.

### Task 5: Three-Module Market Center and Overview

**Files:**
- Create: `apps/web/src/routes/home/market/route.tsx`
- Replace: `apps/web/src/routes/home/market/index.tsx`
- Create: `apps/web/src/routes/home/market/-private/MarketCenterTabs.tsx`
- Create: `apps/web/src/routes/home/market/-private/MarketOverview.tsx`
- Create: `apps/web/src/routes/home/market/-private/StyleRotationBand.tsx`
- Create: `apps/web/src/routes/home/market/-private/AssetRotationList.tsx`
- Modify: `apps/web/src/routes/home/market/index.tsx`

**Interfaces:**
- Consumes: `useMarketCenterOverview`, `useMarketRotation`.
- Produces: `/home/market` overview and three module links.

- [ ] **Step 1: Write failing helper tests for overview presentation**

Cover missing sections, latest dates, quote/rotation mode and growth-defense state labels.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && npm test -- --test-name-pattern "overview presentation"`

Expected: FAIL.

- [ ] **Step 3: Implement overview with equal-height desktop columns**

Use existing Preline Card/Button/Tab patterns. Desktop left and right heights stretch equal; asset rows flex-grow naturally, with no spacer block.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `cd apps/web && npm test -- --test-name-pattern "overview presentation" && pnpm check-types && pnpm lint`

Expected: PASS.

### Task 6: Boards Workspace and Board Detail

**Files:**
- Replace: `apps/web/src/routes/home/market/boards.tsx`
- Create: `apps/web/src/routes/home/market/boards/$code.tsx`
- Create: `apps/web/src/routes/home/market/-private/BoardRankingTable.tsx`
- Create: `apps/web/src/routes/home/market/-private/BoardRotationPanel.tsx`
- Create: `apps/web/src/routes/home/market/-private/BoardAnomalyPanel.tsx`
- Create: `apps/web/src/routes/home/market/-private/BoardDetailPanel.tsx`
- Modify: `apps/web/src/lib/workbench-navigation.ts`

**Interfaces:**
- Consumes: existing boards/fundflow/heatmap hooks plus rotation API.
- Produces: industry/concept page with first row ranking+heatmap and second row rotation+anomaly; rows navigate to board detail.

- [ ] **Step 1: Write failing board-view tests**

Cover no mode tabs, first-layer/second-layer ordering, row destination, and missing heatmap/rotation partial states.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && npm test -- --test-name-pattern "board rotation"`

Expected: FAIL.

- [ ] **Step 3: Implement workspace and detail**

Keep only industry/concept selection. Rotation uses quadrant plus detail table; anomaly mode content is a same-page section. Board detail shows rotation, main net inflow, order-size structure and constituents.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `cd apps/web && npm test -- --test-name-pattern "board rotation" && pnpm check-types && pnpm lint`

Expected: PASS.

### Task 7: Stocks and Existing K-line Detail

**Files:**
- Replace: `apps/web/src/routes/home/market/stock/index.tsx`
- Modify: `apps/web/src/routes/home/market/stock/$symbol.tsx`
- Create: `apps/web/src/routes/home/market/-private/StockFundStructure.tsx`
- Modify: `apps/web/src/routes/home/market/-private/StocksTab.tsx`
- Create: `apps/web/src/lib/stock-detail.test.ts`

**Interfaces:**
- Consumes: instrument/watchlist/quote/fund-flow hooks.
- Produces: full-width stock list; row click to existing K-line detail with funds.

- [ ] **Step 1: Write failing tests**

Cover row destination, no inline detail, fund terminology, and missing fund structure states.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && npm test -- --test-name-pattern "stock detail"`

Expected: FAIL.

- [ ] **Step 3: Implement list/detail changes**

Reuse `klinecharts` and the current incremental update path in `$symbol.tsx`; add fund structure with `mainNetInflow`, super/large/medium/small values and source time. Do not replace the chart.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `cd apps/web && npm test -- --test-name-pattern "stock detail" && pnpm check-types && pnpm lint`

Expected: PASS.

### Task 8: Visual QA and End-to-End Verification

**Files:**
- Modify: `openspec/changes/add-market-center/tasks.md`
- Create: `openspec/changes/add-market-center/verification.md`

- [ ] **Step 1: Run automated suites**

Run: `cd apps/quant && uv run python -m unittest discover -v`

Run: `cd apps/server && npm test`

Run: `cd apps/web && npm test`

Run: `pnpm check-types && pnpm lint && pnpm build`

Expected: all exit 0.

- [ ] **Step 2: Run production pages in browser**

Verify `/home/market`, industry/concept boards, board detail, stock list and stock detail at desktop/mobile and light/dark; verify K-line chart renders with real bars.

- [ ] **Step 3: Record visual and API evidence**

Save production screenshots under `docs/design/prototypes/explorations/screenshots/market-center-v1/production/` and write commands/results in `verification.md`.

- [ ] **Step 4: Review and reconcile**

Run self code review against correctness, partial-data behavior, performance and raw-color usage. Fix only findings required by the spec; record deferred minors in verification.

## Workflow follow-up

- Archive only after explicit user confirmation of the verified implementation.
