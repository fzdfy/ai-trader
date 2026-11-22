# 每日看板 Market Brief API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供统一的 `GET /api/v1/dashboard/market-brief`，返回 A 股、ETF、跨市场三组独立图表、全部固定报价和确定性 A 股信号。

**Architecture:** server 固定资产目录负责 allowlist 和展示元数据，Market Asset Reader 读取独立表，Range Resolver 决定分钟/日线窗口，Signal Service 只消费 A 股输入，Market Brief Service 负责并行组装响应。用户 Work Task 与 Workflow Run 保持独立 API，不进入共享行情缓存。

**Tech Stack:** Hono、Zod、Drizzle ORM、PostgreSQL、Node test runner、TypeScript。

**Spec:** `docs/superpowers/specs/2026-11-22-dashboard-market-radar-design.md`

## Global Constraints

- 资产 allowlist 与单位、session、volume 规则必须与 quant `MARKET_ASSETS` 一致。
- A 股图只允许 `000001.SH | 399006.SZ`；ETF 图只允许三个 ETF；跨市场只允许 `XAUUSD | IXIC`。
- 三组 range 参数互不覆盖，单组缺失只降级对应图表。
- `dashboard-signal-v1` 只使用 A 股趋势、广度和热度；ETF、伦敦金、纳指不得改变因子或置信度。
- `dataConfidence` 只表示数据质量，不表示方向准确率。
- Market Brief 响应不得包含用户 ID、Work Task 或 Workflow Run。
- feature flag 关闭时旧 `/api/v1/dashboard` 必须继续工作。
- 每个任务先写失败测试并取得 RED，再写最小实现。

## Review Focus

- ETF Tab 参数被误当成 SIGNAL 输入 → 测试切换 ETF 时 signal 完全不变。
- 任一图表缺失导致整个接口失败 → 测试部分成功仍返回其他图表并标 `missing`。
- YTD 用自然日空档或错误时区 → 测试 A 股按交易日、XAU 连续时间、IXIC 日线窗口生成。
- 低置信度仍返回方向 → 测试两项核心因子缺失时 `stance=neutral` 且正文为证据不足。
- feature flag 关闭后旧页面不可用 → 测试旧 dashboard 路由保持 200，market-brief 明确不可用。

### Task 1: Server asset catalog and market asset reader

**Files:**

- Create: `apps/server/src/lib/market-assets/catalog.ts`
- Create: `apps/server/src/lib/market-assets/reader.ts`
- Create: `apps/server/src/lib/market-assets/reader.test.ts`

**Interfaces:**

- Consumes: data-platform plan 的 `readStoredMarketAssetQuote`、`readStoredMarketAssetBars` 和 `MARKET_ASSETS` 对应字段。
- Produces: `MarketAssetSymbol`, `MarketRange`, `MarketAssetDefinition`, `MARKET_ASSETS`, `resolveMarketAsset(symbol)`.
- Produces: `readMarketAssetQuote(symbol)` and `readMarketAssetBars(symbol, range)`.
- Produces quote read: `{ quote, asOf, quality, staleReason }`.
- Produces bar read: `{ points, sessionDate, hasVolume, quality, staleReason }`.

- [ ] **Step 1: Write failing catalog and reader tests**

```ts
test("catalog rejects non-allowlisted symbols", () => {
  assert.throws(() => resolveMarketAsset("SPX"), /unknown market asset/i);
});

test("missing ETF bars do not turn the read into success", async () => {
  const result = await readMarketAssetBars("510300.SH", "1D");
  assert.equal(result.quality, "missing");
  assert.deepEqual(result.points, []);
});

test("stale quote keeps its last source timestamp", async () => {
  const result = await readMarketAssetQuote("XAUUSD");
  assert.equal(result.quality, "low");
  assert.match(result.staleReason ?? "", /stale/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-assets/reader.test.ts`

Expected: FAIL because catalog and reader are missing.

- [ ] **Step 3: Implement catalog and reader**

Reader 从 Task 1.3 的三张独立表读取，不访问股票表。`1D` 读 minute；`5D/1M/YTD` 读 daily。质量判定使用资产 session 和最新 `observed_at`，缺失时保留 `staleReason`。

- [ ] **Step 4: Run tests and checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/market-assets/reader.test.ts && pnpm check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/market-assets
git commit -m "feat: add market asset reader"
```

### Task 2: Independent range and chart builders

**Files:**

- Create: `apps/server/src/lib/dashboard/market-range.ts`
- Create: `apps/server/src/lib/dashboard/market-range.test.ts`
- Create: `apps/server/src/lib/dashboard/market-chart.ts`
- Create: `apps/server/src/lib/dashboard/market-chart.test.ts`

**Interfaces:**

- Produces: `resolveMarketRange(range, now, session): { start: Date | null; end: Date; granularity: "minute" | "daily" }`.
- Produces: `toMarketChart(read, definition, range): MarketChartResponse`.
- Produces stable response fields `symbol`, `range`, `timezone`, `sessionDate`, `hasVolume`, `points`, `quality`, `staleReason`.

- [ ] **Step 1: Write failing range tests**

Assert `1D` end date uses A 股/伦敦金/美股各自 session；`5D` includes five asset sessions; `YTD` starts at the asset year boundary; no synthetic weekend points are generated.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/dashboard/market-range.test.ts src/lib/dashboard/market-chart.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement range and chart builders**

Chart builder 按时间升序输出，价格转 number、缺失 volume 保持 null；`hasVolume` 只来自资产目录。不得把 `missing` 图表转换为空成功图。

- [ ] **Step 4: Run tests**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/dashboard/market-range.test.ts src/lib/dashboard/market-chart.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/dashboard
git commit -m "feat: build independent market charts"
```

### Task 3: Deterministic signal and dashboard snapshot inputs

**Files:**

- Create: `apps/server/src/lib/dashboard/dashboard-snapshot.ts`
- Create: `apps/server/src/lib/dashboard/market-signal.ts`
- Create: `apps/server/src/lib/dashboard/market-signal.test.ts`
- Modify: `apps/server/src/api/dashboard.ts`

**Interfaces:**

- Produces: `loadDashboardSnapshot(): Promise<DashboardSnapshot>`，复用现有板块、资金流、涨停与复盘查询。
- Produces: `computeMarketSignal(input: MarketSignalInput): MarketSignal`.
- Produces model version `dashboard-signal-v1`.

- [ ] **Step 1: Write failing signal tests**

Assert overall boundary `>=65` and `<=35`; exactly one missing factor gives `low`; two missing or confidence `<40` gives `missing` and neutral; changing ETF price does not change any factor; evidence strings are deterministic.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/dashboard/market-signal.test.ts`

Expected: FAIL because signal module is missing.

- [ ] **Step 3: Extract dashboard snapshot and implement signal**

把现有 `/dashboard` 的数据库查询移入 `loadDashboardSnapshot()`，路由只返回服务结果。Signal 公式、阈值和 `modelVersion` 必须与设计稿完全一致。

- [ ] **Step 4: Run focused tests**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/dashboard/market-signal.test.ts src/lib/dashboard-data.test.ts`

Expected: PASS，旧 dashboard 纯函数测试无回归。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/dashboard apps/server/src/api/dashboard.ts
git commit -m "feat: add deterministic dashboard signal"
```

### Task 4: Market Brief service and API route

**Files:**

- Create: `apps/server/src/lib/dashboard/market-brief.ts`
- Create: `apps/server/src/lib/dashboard/market-brief.test.ts`
- Create: `apps/server/src/api/dashboard-market-brief.ts`
- Create: `apps/server/src/api/dashboard-market-brief.test.ts`
- Modify: `apps/server/src/api/index.ts`

**Interfaces:**

- Query: `symbol`, `range`, `etfSymbol`, `etfRange`, `globalSymbol`, `globalRange`.
- Produces: `MarketBriefResponse` with `tickers`, `aShareSession`, `aShareChart`, `etfChart`, `globalChart`, `signal`.
- Produces route: `GET /api/v1/dashboard/market-brief`.

- [ ] **Step 1: Write failing service and route tests**

Assert valid defaults, invalid allowlist 400, independent chart ranges, partial missing returns 200, all market data missing returns stable response, and JSON contains no `userId`, `tasks`, or `workflows`.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/dashboard/market-brief.test.ts src/api/dashboard-market-brief.test.ts`

Expected: FAIL because route is not mounted.

- [ ] **Step 3: Implement parallel aggregation and validation**

并行读取七个报价、三张图与 dashboard snapshot；每个读取独立 catch 并降级。Zod 校验 query，路由保持薄层。

- [ ] **Step 4: Run tests and checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/dashboard/market-brief.test.ts src/api/dashboard-market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/dashboard apps/server/src/api
git commit -m "feat: expose dashboard market brief"
```

### Task 5: Feature flag and rollback contract

**Files:**

- Create: `apps/server/src/lib/system-features.ts`
- Create: `apps/server/src/lib/system-features.test.ts`
- Modify: `apps/server/src/api/system.ts`
- Modify: `apps/server/src/api/dashboard-market-brief.ts`
- Modify: `apps/server/src/api/index.test.ts`

**Interfaces:**

- Produces: `getSystemFeatures(): { dashboardMarketRadar: boolean }`.
- Produces: `GET /api/v1/system/features`.
- Disabled market-brief route returns `404`; existing `/api/v1/dashboard` remains 200.

- [ ] **Step 1: Write failing flag tests**

Assert default false, explicit `true` enables, system feature response is authenticated, and disabled market brief does not query market tables.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/system-features.test.ts src/api/index.test.ts`

Expected: FAIL because feature route does not exist.

- [ ] **Step 3: Implement flag and route guard**

只读取服务端 `DASHBOARD_MARKET_RADAR_ENABLED`；客户端不能覆盖。关闭时保留旧 dashboard 和已采数据。

- [ ] **Step 4: Run tests and checks**

Run: `cd apps/server && node --import @oxc-node/core/register --test src/lib/system-features.test.ts src/api/index.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/system-features.ts apps/server/src/api
git commit -m "feat: gate dashboard market radar"
```
