# 行情中心“主要指数”改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将行情中心总览的“主要指数”改为七个 A 股固定指数，支持上证基准、相对大盘和独立大类资产轮动。

**Architecture:** 七个指数日线写入现有 `rotation_index_daily_bar`，由独立的固定目录约束；行情模式组合六个实时报价和 `930955.CSI` 官方收盘，相对大盘在同一服务层按共同交易日计算百分点超额收益。

**Tech Stack:** Python FastAPI + unittest、Hono + Drizzle + node:test、React 19 + TanStack Query + Preline + Tailwind。

**Spec:** `openspec/changes/add-market-center/specs/market-center/spec.md`、`openspec/changes/add-market-center/specs/market-rotation/spec.md`

## Global Constraints

- 标题固定为“主要指数”。
- 顺序固定为：上证指数、沪深300、中证500、中证1000、创业板50、科创50、中证红利低波100。
- 上证指数单独全宽一行，并标记为“市场基准”。
- 其余六项桌面为 `3 × 2`、移动端为 `2 × 3`，行情和相对大盘模式必须等高。
- 行情模式逐项显示来源和业务日期，不使用统一实时时间。
- 相对大盘只使用七个指数共同交易日；有效风格指数少于 4 个时不生成排名。
- 不包含 ETF、黄金或海外指数；大类资产轮动放在独立区域。
- 生产代码修改前，视觉探索稿与截图必须保持已确认状态。

## Review Focus

- `930955.CSI` 当天未发布时，相对大盘必须退到最近共同交易日，不能取不同日期。
- 任一指数实时报价失败时，保留固定位置和可用项，不把缺失值变成零。
- 沪深指数代码前缀错误时，不能把 `000300` 错路由成深市股票。
- 少于 4 个有效风格指数时仍显示行情，但不得显示排名。
- 行情/相对大盘切换后布局高度不得跳动，键盘焦点不得丢失。

---

### Task 1: Main index provider and common daily payload

**Files:**
- Modify: `apps/quant/data/index_rotation.py`
- Modify: `apps/quant/data/router.py`
- Test: `apps/quant/tests/test_index_rotation.py`

**Interfaces:**
- Produces: `MAIN_INDEX_ASSETS: dict[str, MainIndexDefinition]`
- Produces: `fetch_main_index_history(start: str, end: str) -> dict`
- Produces: `GET /api/v1/data/main-indices/daily?start=&end=`
- Preserves: `fetch_growth_defense_history(start, end)` for the existing growth/defense ratio.

- [x] **Step 1: Write failing provider tests**

Add assertions for the exact seven-symbol catalog, Tencent `sh000300` parsing, CSIndex `930955` parsing, and partial failure preserving the other six symbols.

```python
self.assertEqual(list(MAIN_INDEX_ASSETS), [
    "000001.SH", "000300.SH", "000905.SH", "000852.SH",
    "399673.SZ", "000688.SH", "930955.CSI",
])
self.assertEqual(parse_tencent_index_daily(payload, "000300.SH")[0].source, "tencent")
self.assertEqual(result["bars"][0].symbol, "000300.SH")
self.assertEqual(result["errors"][0]["symbol"], "930955.CSI")
```

- [x] **Step 2: Run RED**

Run: `cd apps/quant && .venv/bin/python -m unittest tests.test_index_rotation -v`

Expected: FAIL because the seven-index catalog and generic fetch do not exist.

- [x] **Step 3: Implement provider**

Generalize Tencent parsing to resolve provider symbols from the catalog, keep explicit Tencent and CSIndex child fetches, and aggregate partial failures by symbol.

- [x] **Step 4: Add route test and route**

Assert `/main-indices/daily` forwards validated dates and returns the common payload.

- [x] **Step 5: Run GREEN**

Run: `cd apps/quant && .venv/bin/python -m unittest tests.test_index_rotation -v`

Expected: PASS.

### Task 2: Store and sync all seven index histories

**Files:**
- Modify: `apps/server/src/db/schema/market-rotation.ts`
- Modify: `apps/server/src/lib/market-rotation/store.ts`
- Modify: `apps/server/src/lib/quant.ts`
- Modify: `apps/server/src/workers/sync-worker/pipes/rotation-indices.ts`
- Test: `apps/server/src/lib/market-rotation/store.test.ts`
- Test: `apps/server/src/workers/sync-worker/pipes/rotation-indices.test.ts`

**Interfaces:**
- Produces: `MAIN_INDEX_SYMBOLS` and `MarketIndexSymbol`
- Produces: `quant.mainIndexDaily(start, end)`
- Produces: `runMainIndexDailyJob()`
- Consumes: the Task 1 `/main-indices/daily` payload

- [x] **Step 1: Write failing store and sync tests**

Assert that all seven symbols pass validation, duplicates collapse by `(symbol, tradeDate)`, and a partial source failure still upserts available bars.

- [x] **Step 2: Run RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-rotation/store.test.ts src/workers/sync-worker/pipes/rotation-indices.test.ts`

Expected: FAIL because the storage catalog only accepts two symbols.

- [x] **Step 3: Extend storage**

Keep the growth/defense pair as a separate named set, add the seven-symbol storage set, and keep `rotation_index_daily_bar` write behavior idempotent.

- [x] **Step 4: Extend sync**

Read the common quant payload, upsert available bars, and return failed symbols without discarding successful ones.

- [x] **Step 5: Run GREEN**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-rotation/store.test.ts src/workers/sync-worker/pipes/rotation-indices.test.ts`

Expected: PASS.

### Task 3: Overview main-index section and benchmark rotation

**Files:**
- Create: `apps/server/src/lib/market-center/main-indices.ts`
- Create: `apps/server/src/lib/market-center/main-indices.test.ts`
- Create: `apps/server/src/lib/market-rotation/benchmark.ts`
- Create: `apps/server/src/lib/market-rotation/benchmark.test.ts`
- Modify: `apps/server/src/lib/market-center/rotation.ts`
- Modify: `apps/server/src/api/market-center.ts`
- Test: `apps/server/src/api/market-center.test.ts`

**Interfaces:**
- Produces: `loadMainIndexQuotes(): Promise<MainIndexSection>`
- Produces: `computeBenchmarkRotation(series, window)`
- Produces: `/overview` field `mainIndices`
- Produces: rotation scope `main-benchmark`

- [x] **Step 1: Write failing computation tests**

Cover common-date intersection, percentage-point excess return, descending rank, missing index retention, and fewer than four style indices.

```ts
assert.equal(computeBenchmarkRotation(series, "20D").asOf, "2026-11-21");
assert.equal(rows[0].excessReturn, 1.54);
assert.equal(insufficient.rows.every((row) => row.rank === null), true);
assert.equal(insufficient.status, "low");
```

- [x] **Step 2: Run RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-rotation/benchmark.test.ts src/lib/market-center/main-indices.test.ts src/api/market-center.test.ts`

Expected: FAIL because the new contract does not exist.

- [x] **Step 3: Implement quote assembly**

Read six live quotes through the existing market-data reader and derive `930955.CSI` quote fields from its latest stored official daily bar; return per-item source, date and quality.

- [x] **Step 4: Implement benchmark rotation**

Align seven series on common dates, compute `indexReturn - benchmarkReturn`, rank descending, and set ranks to `null` below four valid peers.

- [x] **Step 5: Extend API validation**

Add `scope=main-benchmark` and return `mainIndices` without removing the existing overview fields or cross-asset `scope=asset`.

- [x] **Step 6: Run GREEN**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-rotation/benchmark.test.ts src/lib/market-center/main-indices.test.ts src/api/market-center.test.ts`

Expected: PASS.

### Task 4: Web types and query requests

**Files:**
- Modify: `apps/web/src/lib/market-center.ts`
- Modify: `apps/web/src/lib/market-center.test.ts`
- Modify: `apps/web/src/hooks/useMarketCenter.ts`

**Interfaces:**
- Produces: `MainIndexItem`, `MainIndexSection`, `MainBenchmarkRotationResponse`
- Produces: `useMainBenchmarkRotation(window)`
- Extends: `MarketCenterOverviewResponse.mainIndices`

- [x] **Step 1: Write failing contract tests**

Assert role labels, fixed symbol order, benchmark placement, excess-return formatting helper, and `main-benchmark` URL construction.

- [x] **Step 2: Run RED**

Run: `cd apps/web && npm test -- --test-name-pattern "main index"`

Expected: FAIL because the types and formatter do not exist.

- [x] **Step 3: Implement types and hook**

Use stable query keys `["market-center","main-benchmark",window]` and forward the TanStack Query abort signal.

- [x] **Step 4: Run GREEN**

Run: `cd apps/web && npm test -- --test-name-pattern "main index"`

Expected: PASS.

### Task 5: Main index and independent cross-asset UI

**Files:**
- Create: `apps/web/src/routes/home/market/-private/MainIndexPanel.tsx`
- Create: `apps/web/src/routes/home/market/-private/CrossAssetRotationPanel.tsx`
- Modify: `apps/web/src/routes/home/market/index.tsx`
- Test: `apps/web/src/lib/market-center.test.ts`

**Interfaces:**
- Consumes: `overview.mainIndices` and `useMainBenchmarkRotation(window)`
- Produces: stable “行情 / 相对大盘” mode with `5/20/60` window
- Preserves: independent `useMarketRotation("asset","20D")`

- [x] **Step 1: Write failing presentation-helper tests**

Cover fixed item order, benchmark count, and sample-insufficient labels.

- [x] **Step 2: Run RED**

Run: `cd apps/web && npm test -- --test-name-pattern "main index presentation"`

Expected: FAIL.

- [x] **Step 3: Implement MainIndexPanel**

Render the benchmark in its own full-width row, six cards below, per-item source/date, and matching desktop/mobile heights for quote and benchmark modes.

- [x] **Step 4: Implement cross-asset separation**

Render cross-asset rotation after the main overview row with its own heading, date and switch controls.

- [x] **Step 5: Verify interactions**

Run: `cd apps/web && npm test && pnpm check-types && pnpm lint`

Expected: PASS with no new lint errors.

### Task 6: Production integration and visual verification

**Files:**
- Modify: `openspec/changes/add-market-center/verification.md`
- Update: `docs/design/prototypes/initial/` after production acceptance
- Update: `docs/design/prototypes/atlas/index.html` after production acceptance

- [x] **Step 1: Run full suites**

Run:

```bash
cd apps/quant && .venv/bin/python -m unittest discover -s tests -v
cd apps/server && DATABASE_URL='postgres://ai-trader:aitrader123@127.0.0.1:5532/aitrader?application_name=server-test' npm test
cd apps/web && npm test
pnpm check-types
pnpm lint
pnpm build
```

Expected: all exit 0; database tests may require sandbox escalation.

- [x] **Step 2: Deploy and verify real APIs**

Verify:

```text
/api/v1/market-center/overview -> mainIndices length 7
/api/v1/market-center/rotation?scope=main-benchmark&window=20D -> common asOf
```

- [x] **Step 3: Production visual QA**

Capture light/dark and desktop/mobile screenshots for both modes, missing data, stale data, insufficient sample, and keyboard focus. Confirm desktop and mobile main-card heights match between modes.

- [x] **Step 4: Record verification**

Write actual commands, outputs, screenshot paths, fixed findings and remaining minors into `verification.md`.

## Workflow follow-up

- User acceptance after implementation is separate.
- OpenSpec archive requires a separate explicit confirmation.
