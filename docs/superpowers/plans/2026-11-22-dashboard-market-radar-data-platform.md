# 每日看板跨资产数据平台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为固定指数、ETF、伦敦金和纳指建立独立报价、分钟线与日线存储，通过可追踪的 Worker 任务持续采集并保留 13 个月分钟数据。

**Architecture:** 在 quant 取数层增加独立 market-asset capability，不扩展现有股票 quote/kline 契约；server 使用独立 `market_asset_*` 表和 Reader 写入，再供 Market Brief API 读取。任何资产失败都保留其他资产结果，跨资产永远不写入 A 股复权与回测表。

**Tech Stack:** Python 3.12、FastAPI、Pydantic、unittest、Hono、Drizzle ORM、PostgreSQL、Node test runner、sync-worker。

**Spec:** `docs/superpowers/specs/2026-11-22-dashboard-market-radar-design.md`

## Global Constraints

- 固定资产 allowlist 只有 `000001.SH`、`399006.SZ`、`510300.SH`、`588000.SH`、`159992.SZ`、`XAUUSD`、`IXIC`。
- 指数使用“点”，A 股 ETF 使用人民币元，伦敦金使用 `USD/oz`；伦敦金无成交量。
- A 股遵循 `09:30–11:30 / 13:00–15:00`；伦敦金接受连续交易与跨午夜；IXIC 分钟桶固定 5 分钟。
- 腾讯负责七个资产报价、A 股指数/ETF 分钟和日线；新浪负责 XAU 分钟和日线；Yahoo 负责 IXIC 5 分钟和日线。
- 只使用 mootdx、腾讯、新浪和 Yahoo 等已确认来源；不得引入东财或静默混用不同资产口径。
- 新表不得写入 `bar1d_raw`、`bar1m_adj`、`bar1d_qfq`、`bar1d_hfq` 或 `load_kline`。
- 分钟线从上线后前向采集，保留 13 个月；不补造历史分钟。
- 每个任务先取得失败测试 RED，再写最小实现并取得 GREEN。
- 已确认视觉稿：`docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v6.html`。

## Review Focus

- 未知资产或 provider 不支持时返回空数组冒充成功 → 测试必须抛出明确错误并在 API 映射为 400。
- 伦敦金跨午夜数据被归到错误 `session_date` → fixture 测试 23:59 与 00:00 的连续点。
- 某一资产采集失败导致整批回滚 → 测试部分成功仍写入其他资产并汇总失败。
- 分钟保留任务误删日线或 A 股行情 → 测试只删除超过 13 个月的 `market_asset_minute_bar`。
- IXIC 被错误按 1 分钟承诺 → 测试 provider 只接受 `5m` 分钟桶和日线。

### Task 1: Market-asset contracts, registry, and quant endpoints

**Files:**

- Create: `apps/quant/data/market_assets.py`
- Modify: `apps/quant/data/schemas.py`
- Modify: `apps/quant/data/base.py`
- Modify: `apps/quant/data/registry.py`
- Modify: `apps/quant/data/router.py`
- Test: `apps/quant/tests/test_market_asset_providers.py`

**Interfaces:**

- Produces: `MarketAssetQuote`, `MarketAssetBar`, `MarketAssetDefinition`, `MARKET_ASSETS`.
- Produces capabilities: `market_asset_quote`, `market_asset_minute`, `market_asset_daily`.
- Produces: `MarketProvider.market_asset_quote(symbols: list[str]) -> dict[str, MarketAssetQuote]`.
- Produces: `MarketProvider.market_asset_minute(symbol: str, tf: str, limit: int, start: str | None, end: str | None) -> list[MarketAssetBar]`.
- Produces: `MarketProvider.market_asset_daily(symbol: str, limit: int, start: str | None, end: str | None) -> list[MarketAssetBar]`.
- Produces endpoints: `GET /api/v1/data/market-assets/quotes`, `/minute`, `/daily`.

- [ ] **Step 1: Write failing catalog, provider, and route tests**

```python
def test_unknown_market_asset_is_rejected():
    with self.assertRaisesRegex(ValueError, "unknown market asset"):
        resolve_market_asset("SPX")

def test_market_asset_quotes_preserve_requested_symbols():
    response = client.get("/api/v1/data/market-assets/quotes?symbols=000001.SH,XAUUSD")
    self.assertEqual(set(response.json()), {"000001.SH", "XAUUSD"})

def test_market_asset_routes_reject_wrong_timeframe():
    response = client.get("/api/v1/data/market-assets/minute?symbol=IXIC&tf=1m")
    self.assertEqual(response.status_code, 400)
```

另测 `MARKET_ASSETS` 七个符号的单位、session、`has_volume`，以及 provider 不支持时显式 `NotImplementedError`。

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_market_asset_providers.py' -v`

Expected: FAIL because `data.market_assets` and the new capabilities do not exist.

- [ ] **Step 3: Implement the asset catalog, models, capabilities, and router**

资产目录使用不可变定义；`resolve_market_asset()` 只接受固定 allowlist。Router 只做参数校验和 capability 调用，未知资产返回 400，上游失败返回 502。

- [ ] **Step 4: Run focused tests**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_market_asset_providers.py' -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/quant/data apps/quant/tests/test_market_asset_providers.py
git commit -m "feat: add market asset data contracts"
```

### Task 2: Tencent, Sina, and Yahoo market-asset providers

**Files:**

- Modify: `apps/quant/data/providers/tencent/provider.py`
- Modify: `apps/quant/data/providers/sina/provider.py`
- Create: `apps/quant/data/providers/yahoo/__init__.py`
- Create: `apps/quant/data/providers/yahoo/provider.py`
- Modify: `apps/quant/data/providers/__init__.py`
- Modify: `apps/quant/data/registry.py`
- Test: `apps/quant/tests/test_market_asset_providers.py`

**Interfaces:**

- Consumes: `MARKET_ASSETS`, `MarketAssetQuote`, `MarketAssetBar`.
- Produces: Tencent market-asset quote/minute/daily implementations.
- Produces: Sina XAU minute/daily implementation.
- Produces: Yahoo IXIC 5-minute/daily implementation.
- Produces parsers: `parse_tencent_market_asset_quote`, `parse_sina_xau_bars`, `parse_yahoo_ixic_bars`.
- Produces registry chains:
  - quote: `tencent`
  - minute: `tencent`, `sina`, `yahoo` by asset capability
  - daily: `tencent`, `sina`, `yahoo` by asset capability

- [ ] **Step 1: Add parser fixtures as failing tests**

```python
def test_tencent_xau_quote_uses_usd_per_ounce():
    quote = parse_tencent_market_asset_quote(fixture("tencent_xau"))
    self.assertEqual(quote.price_unit, "USD/oz")
    self.assertEqual(quote.symbol, "XAUUSD")

def test_sina_xau_bars_keep_cross_midnight_session_date():
    bars = parse_sina_xau_bars(fixture("sina_xau_minute"))
    self.assertNotEqual(bars[0].session_date, bars[-1].session_date)

def test_yahoo_ixic_rejects_one_minute():
    with self.assertRaisesRegex(ValueError, "5m"):
        YahooProvider().market_asset_minute("IXIC", tf="1m", limit=100, start=None, end=None)
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_market_asset_providers.py' -v`

Expected: FAIL for missing parser/provider implementations.

- [ ] **Step 3: Implement providers and registry registration**

Provider 必须返回结构化白名单字段；上游空响应视为错误，不用空数组冒充成功。腾讯报价复用现有 `qt.gtimg.cn` 解析能力但使用固定 provider symbol；新浪和 Yahoo 各自解析 5 分钟/日线并填 `session_date`、`bucket_start`、`source`。

- [ ] **Step 4: Run tests and source contract checks**

Run: `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_market_asset_providers.py' -v`

Expected: PASS，覆盖单位、无成交量、IXIC 5 分钟限制和跨午夜。

- [ ] **Step 5: Commit**

```bash
git add apps/quant/data/providers apps/quant/data/registry.py apps/quant/tests/test_market_asset_providers.py
git commit -m "feat: add cross-asset providers"
```

### Task 3: Independent PostgreSQL schema and migration

**Files:**

- Create: `apps/server/src/db/schema/market-assets.ts`
- Modify: `apps/server/src/db/schema/index.ts`
- Create: `apps/server/src/db/market-asset-schema.test.ts`
- Generate: `apps/server/migrations/<generated>.sql`

**Interfaces:**

- Produces Drizzle exports: `marketAssetQuote`, `marketAssetMinuteBar`, `marketAssetDailyBar`.
- Quote PK: `symbol`.
- Minute PK: `(symbol, bucket_start)` plus `(symbol, bucket_start desc)` and `session_date` indexes.
- Daily PK: `(symbol, trade_date)`.

- [ ] **Step 1: Write failing schema tests**

Assert exact table names, numeric precision, PK columns and absence of foreign keys into stock/backtest tables.

- [ ] **Step 2: Run schema test and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/db/market-asset-schema.test.ts`

Expected: FAIL because schema exports are missing.

- [ ] **Step 3: Add schema and generate the migration**

Run: `cd apps/server && pnpm db:generate`

Verify the generated SQL creates only the three independent tables and their indexes; record the generated filename in this plan's task completion note.

- [ ] **Step 4: Run schema test and type check**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/db/market-asset-schema.test.ts && pnpm check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db apps/server/migrations
git commit -m "feat: add market asset storage"
```

### Task 4: Server storage adapter and idempotent ingestion

**Files:**

- Create: `apps/server/src/lib/market-assets/store.ts`
- Create: `apps/server/src/lib/market-assets/store.test.ts`
- Modify: `apps/server/src/lib/quant.ts`

**Interfaces:**

- Produces quant client methods: `marketAssetQuotes(symbols)`, `marketAssetMinute(symbol, params)`, `marketAssetDaily(symbol, params)`.
- Produces: `upsertMarketAssetQuotes(values): Promise<number>`.
- Produces: `upsertMarketAssetBars(values): Promise<{ minute: number; daily: number }>`.
- Produces: `readStoredMarketAssetQuote(symbol)` and `readStoredMarketAssetBars(symbol, range)`，只返回存储行，不决定展示质量。

- [ ] **Step 1: Write failing partial-success and idempotency tests**

Use injected fetch/upsert dependencies. Assert one failing asset never prevents successful assets; duplicate symbol+bucket writes report one upsert batch; no stock tables are referenced.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-assets/store.test.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement server store**

PostgreSQL numeric values are stored as decimal strings. Upsert conflicts update the full latest payload. Return per-symbol errors and counts; throw only when every requested asset fails.

- [ ] **Step 4: Run tests and checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-assets/store.test.ts && pnpm check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/quant.ts apps/server/src/lib/market-assets
git commit -m "feat: ingest market assets"
```

### Task 5: Minute, daily, and daily-backfill Worker jobs

**Files:**

- Create: `apps/server/src/workers/sync-worker/pipes/market-asset-minute.ts`
- Create: `apps/server/src/workers/sync-worker/pipes/market-asset-daily.ts`
- Create: `apps/server/src/workers/sync-worker/pipes/market-asset-jobs.test.ts`
- Modify: `apps/server/src/workers/sync-worker/runner.ts`
- Modify: `apps/server/src/workers/sync-worker/cron-config.ts`

**Interfaces:**

- Produces runners: `market-asset-minute`, `market-asset-daily`, `market-asset-daily-backfill`.
- Produces injectable job functions with `now`, fetch and upsert dependencies.
- Cron: minute every minute; daily at `06:10` and `16:10`; backfill at low-traffic time after daily.

- [ ] **Step 1: Write failing schedule and session-window tests**

Assert A 股非交易时段不发请求；XAU 跨午夜连续采集；IXIC 使用 `5m`；一个资产失败后其余资产仍写入；minute job 不调用日线接口。

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/workers/sync-worker/pipes/market-asset-jobs.test.ts`

Expected: FAIL because runners are missing.

- [ ] **Step 3: Implement job orchestration and cron registration**

每个任务写独立 `job_run`。minute 任务同时刷新七个资产的最新报价与当日分钟线；daily 任务只写日线；进度包含成功、失败和缺失资产。部分成功通过任务错误摘要表达，不把整个市场缓存回滚。

- [ ] **Step 4: Run tests and checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/workers/sync-worker/pipes/market-asset-jobs.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/workers/sync-worker
git commit -m "feat: schedule market asset ingestion"
```

### Task 6: Thirteen-month retention and data-quality evidence

**Files:**

- Create: `apps/server/src/workers/sync-worker/pipes/market-asset-retention.ts`
- Create: `apps/server/src/workers/sync-worker/pipes/market-asset-retention.test.ts`
- Modify: `apps/server/src/workers/sync-worker/runner.ts`
- Modify: `apps/server/src/workers/sync-worker/cron-config.ts`
- Modify: `docs/data-pipeline.md`

**Interfaces:**

- Produces: `retentionCutoff(now: Date): Date`.
- Produces runner: `market-asset-retention`.
- Produces documented retention and source ownership.

- [ ] **Step 1: Write failing cutoff and scope tests**

Assert the cutoff is exactly 13 calendar months before `now`, only minute rows older than cutoff are selected, and daily/quote tables are not touched.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/workers/sync-worker/pipes/market-asset-retention.test.ts`

Expected: FAIL because retention runner is missing.

- [ ] **Step 3: Implement retention and documentation**

Use a single indexed delete by `bucket_start`. Log deleted count, cutoff and job run ID. Document the three market-asset pipelines in `docs/data-pipeline.md`.

- [ ] **Step 4: Run tests and checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/workers/sync-worker/pipes/market-asset-retention.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/workers docs/data-pipeline.md
git commit -m "chore: retain market asset minute bars"
```
