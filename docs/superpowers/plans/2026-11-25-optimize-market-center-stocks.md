# 行情中心个股模块分页与白色数据画布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将行情中心个股列表改成 20 条/页的稳定分页，并把 Quick Quote Detail 的 K 线与资金结构统一为双主题下固定白色的数据画布。

**Architecture:** 服务端统一校验分页参数并按 `instrument.symbol ASC` 排序；全市场沿用现有分页接口，自选接口保留旧数组响应并增加分页模式，同时全部 watchlist 读写改为 Better Auth Session。前端以 URL 为列表状态源，复用 Preline Pagination；快速详情继续使用现有 `klinecharts`，通过局部白色 token 和完整图表样式覆盖，不修改 K 线数据链路。

**Tech Stack:** Hono + Drizzle + Zod + node:test、React 19 + TanStack Router/Query + Preline + Tailwind、klinecharts 10。

**Spec:**

- `openspec/changes/optimize-market-center-stocks/proposal.md`
- `openspec/changes/optimize-market-center-stocks/specs/market-center/spec.md`
- `openspec/changes/optimize-market-center-stocks/specs/preline-workbench-ui/spec.md`
- `openspec/changes/optimize-market-center-stocks/design.md`
- `docs/superpowers/specs/2026-11-25-optimize-market-center-stocks-design.md`
- `docs/design/prototypes/explorations/quant-workbench-market-center-stocks-v1.html`

## Global Constraints

- 全市场、搜索结果和自选均每页 10 只，按完整股票 `symbol` 升序。
- URL 状态字段固定为 `tab/page/q`；切换 Tab 或提交新搜索回到第 1 页，保留已提交的 `q`。
- 自选无 `page/limit` 时保留旧数组响应；同时提供两者时返回分页响应；只提供其中一个返回 `400`。
- 全部 watchlist 读写使用 Better Auth 服务端 Session；不得读取或信任 `X-User-Id`。
- watchlist query key 必须包含 `userId`；Session 未就绪时不发起请求。
- 只修改 Quick Quote Detail `/home/market/stock/$symbol`，不修改个股分析页面。
- K 线主图、成交量、MACD、坐标轴、图表外围和资金结构使用同一白色数据画布；浅色、深色均保持白底。
- 导航、周期切换和操作按钮继续使用全局主题。
- 不修改 K 线 Provider、复权、PIT、周期、指标计算、资金口径或数据库结构。
- 使用 Preline 语义组件和语义 token，不在业务组件散落 raw hex。
- 每个任务完成 RED → GREEN 并单独提交；未获用户确认不得进入下一任务。

## Review Focus

- **伪造身份头**：携带他人 `X-User-Id` 的自选请求仍只能读取当前 Session 用户的数据。
- **账号切换缓存泄漏**：同一浏览器退出或切换账号后，不得短暂显示上一用户自选。
- **URL 返回链**：从列表进入详情再返回，必须恢复原 `tab/page/q`，不能回到默认列表。
- **分页稳定性**：相同快照下跨页不重复、不遗漏；结果总数必须按关联后的实际股票行数计算。
- **白色画布异常态**：K 线 loading、empty、error 和资金结构缺失时，画布仍是白色且不会把失败误报为空数据。

---

### Task 1: 服务端分页参数与全市场稳定排序

**Files:**

- Create: `apps/server/src/lib/stock-list-query.ts`
- Create: `apps/server/src/lib/stock-list-query.test.ts`
- Modify: `apps/server/src/api/instruments.ts`

**Interfaces:**

- Produces: `parseInstrumentListQuery(search: URLSearchParams): InstrumentListQuery`
- Produces: `parseWatchlistQuery(search: URLSearchParams): WatchlistQuery`
- Produces: `InstrumentListQuery = { ok: true; page: number; limit: number; q: string } | { ok: false; message: string }`
- Produces: `WatchlistQuery = { ok: true; mode: "legacy"; q: string } | { ok: true; mode: "paginated"; page: number; limit: number; q: string } | { ok: false; message: string }`
- Later tasks consume both parsers.

- [ ] **Step 1: Write failing parser tests**

Add tests asserting:

```ts
assert.deepEqual(parseInstrumentListQuery(new URLSearchParams("page=2&limit=20&q=比亚迪")), {
  ok: true,
  page: 2,
  limit: 20,
  q: "比亚迪",
});
assert.equal(parseInstrumentListQuery(new URLSearchParams("page=0&limit=20")).ok, false);
assert.equal(parseInstrumentListQuery(new URLSearchParams("page=1&limit=201")).ok, false);
assert.deepEqual(parseWatchlistQuery(new URLSearchParams()), {
  ok: true,
  mode: "legacy",
  q: "",
});
assert.deepEqual(parseWatchlistQuery(new URLSearchParams("page=1&limit=20&q=银行")), {
  ok: true,
  mode: "paginated",
  page: 1,
  limit: 20,
  q: "银行",
});
assert.equal(parseWatchlistQuery(new URLSearchParams("page=1")).ok, false);
assert.equal(parseWatchlistQuery(new URLSearchParams("limit=20")).ok, false);
```

- [ ] **Step 2: Run the parser tests and verify RED**

Run:

```bash
cd apps/server
node --import @oxc-node/core/register --test src/lib/stock-list-query.test.ts
```

Expected: FAIL because `stock-list-query.ts` does not exist.

- [ ] **Step 3: Implement the two query parsers**

Use Zod coercion for positive integers. Default full-market pagination to `page=1&limit=50`; cap `limit` at 200. Trim `q`, default it to `""`, and reject non-integer, non-positive or oversized values. For watchlist, treat absence of both pagination fields as legacy mode and reject a partial pair.

- [ ] **Step 4: Run the parser tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write a failing full-market ordering test**

In `stock-list-query.test.ts`, use Drizzle's mock driver to assert the generated instrument page query contains `order by "instrument"."symbol" asc` before pagination.

- [ ] **Step 6: Run the ordering test and verify RED**

Run the Step 2 command. Expected: FAIL because `instruments.ts` does not yet apply `asc(instrument.symbol)`.

- [ ] **Step 7: Apply parser validation and `symbol ASC`**

In `apps/server/src/api/instruments.ts`, replace numeric parsing with `parseInstrumentListQuery()` and add `.orderBy(asc(instrument.symbol))` before `.limit().offset()`. Return `400` with the parser message on invalid input.

- [ ] **Step 8: Run the focused server tests**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/lib/stock-list-query.ts apps/server/src/lib/stock-list-query.test.ts apps/server/src/api/instruments.ts
git commit -m "feat(server): add stable stock list pagination query"
```

---

### Task 2: Watchlist Session 安全、搜索与分页

**Files:**

- Modify: `apps/server/src/api/watchlist.ts`
- Modify: `apps/server/src/api/index.ts`
- Create: `apps/server/src/api/watchlist.test.ts`

**Interfaces:**

- Consumes: `parseWatchlistQuery()` from Task 1.
- Produces: `resolveWatchlistUserId(headers: Headers): Promise<string | null>`
- Produces: `createWatchlistRoute(resolveUserId?: (headers: Headers) => Promise<string | null>): Hono`
- Produces: `watchlistRoute` remains the mounted singleton.

- [ ] **Step 1: Write failing no-session and partial-parameter tests**

Create a route with an injected resolver returning `null`; assert all `GET/POST/DELETE` routes return `401`. Create a route with an injected user; assert `/instruments?page=1` and `/instruments?limit=20` return `400` before querying data.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd apps/server
node --import @oxc-node/core/register --test src/api/watchlist.test.ts
```

Expected: FAIL because the route factory and Session resolver do not exist.

- [ ] **Step 3: Implement Session identity and deterministic ordering**

Use `auth.api.getSession({ headers })` in the default resolver. Use the resolved user ID for every read/write. Order symbols and instrument rows by `instrument.symbol ASC`; ignore any incoming `X-User-Id`.

- [ ] **Step 4: Add database-backed contract tests**

Under `ADMIN_DB_TESTS=1`, create two users' watchlists and instruments. Assert:

- legacy mode returns only the injected Session user's sorted array;
- paginated mode returns only matching `q` rows and correct total/range metadata;
- a forged `X-User-Id` does not change the result;
- add/delete only affect the Session user.

Use `crypto.randomUUID()` fixture values and clean up in `t.after()`.

- [ ] **Step 5: Run focused no-DB and DB tests**

Run:

```bash
cd apps/server
node --import @oxc-node/core/register --test src/api/watchlist.test.ts
ADMIN_DB_TESTS=1 node --env-file-if-exists=../../.env.local --import @oxc-node/core/register --test src/api/watchlist.test.ts
```

Expected: both commands PASS; database assertions are skipped in the first run.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/api/watchlist.ts apps/server/src/api/index.ts apps/server/src/api/watchlist.test.ts
git commit -m "feat(server): secure and paginate watchlist APIs"
```

---

### Task 3: 前端 URL 状态与分页查询契约

**Files:**

- Create: `apps/web/src/lib/stock-list-state.ts`
- Create: `apps/web/src/lib/stock-list-state.test.ts`
- Modify: `apps/web/src/hooks/useInstruments.ts`

**Interfaces:**

- Produces: `STOCK_LIST_PAGE_SIZE = 20`
- Produces: `parseStockListSearch(search: Record<string, unknown>): StockListSearch`
- Produces: `stockPageRange(page: number, rowCount: number, total: number): { rangeStart: number; rangeEnd: number }`
- Produces: `toStockDetailSearch(search: StockListSearch): { from: "market-stock"; listTab: StockListSearch["tab"]; listPage: number; listQ: string }`
- Produces: `toStockReturnSearch(search: StockDetailSearch): StockListSearch`
- Produces: `useInstrumentPageQuery(q: string, page: number, limit?: number)`
- Produces: `useWatchlistInstrumentPageQuery(q: string, page: number, limit?: number)`
- Keeps: existing `useInstrumentsQuery` and `useWatchlistInstrumentsQuery` for analysis/search consumers.

- [ ] **Step 1: Write failing pure-state tests**

Assert:

```ts
assert.deepEqual(parseStockListSearch({}), { tab: "stock", page: 1, q: "" });
assert.deepEqual(parseStockListSearch({ tab: "watchlist", page: "3", q: "银行" }), {
  tab: "watchlist",
  page: 3,
  q: "银行",
});
assert.deepEqual(parseStockListSearch({ page: "bad" }).page, 1);
assert.deepEqual(stockPageRange(2, 9, 29), { rangeStart: 21, rangeEnd: 29 });
assert.deepEqual(toStockReturnSearch(toStockDetailSearch({ tab: "watchlist", page: 2, q: "银行" })), {
  tab: "watchlist",
  page: 2,
  q: "银行",
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd apps/web
node --test --experimental-strip-types src/lib/stock-list-state.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement URL-state helpers**

Normalize page to a positive integer, default `tab` to `"stock"`, trim `q`, and calculate inclusive ranges with `0–0 / 0` for empty results.

- [ ] **Step 4: Run the state tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Add paged query hooks and user-scoped cache keys**

Add regular `useQuery` hooks for the market stock page. Keep the current infinite hooks unchanged. Use:

```ts
["instrument-page", q, page, limit]
["watchlist", userId]
["watchlistInstruments", userId]
["watchlistInstruments", userId, "page", q, page, limit]
```

Disable watchlist queries without `userId`. Remove `X-User-Id` from all watchlist fetches. Invalidate both watchlist prefixes after add/delete.

- [ ] **Step 6: Run focused tests and type check**

Run:

```bash
cd apps/web
node --test --experimental-strip-types src/lib/stock-list-state.test.ts
pnpm check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/stock-list-state.ts apps/web/src/lib/stock-list-state.test.ts apps/web/src/hooks/useInstruments.ts
git commit -m "feat(web): add URL-backed stock list data state"
```

---

### Task 4: 个股列表分页、搜索与详情返回上下文

**Files:**

- Modify: `apps/web/src/routes/home/market/stock/index.tsx`
- Modify: `apps/web/src/routes/home/market/stock/$symbol.tsx:120-220,370-420`

**Interfaces:**

- Consumes: `parseStockListSearch`, `stockPageRange`, `toStockDetailSearch`, `toStockReturnSearch`, `STOCK_LIST_PAGE_SIZE`
- Consumes: `useInstrumentPageQuery`, `useWatchlistInstrumentPageQuery`
- Consumes: `@preline-ui/Pagination`, `paginationTokens()`

- [ ] **Step 1: Add a failing source-level state regression test**

Extend `stock-list-state.test.ts` with a page clamp helper:

```ts
assert.equal(normalizeStockPage(99, 2), 2);
assert.equal(normalizeStockPage(3, 0), 1);
```

Run the Task 3 test command and verify RED before adding `normalizeStockPage`.

- [ ] **Step 2: Implement list URL behavior**

Use `Route.useSearch()` as the source of truth for `tab/page/q`. Keep `inputValue` as a pre-submit draft. Search and Tab changes navigate with `page=1`; page changes navigate without replace. If a response shows the requested page above `totalPages`, replace the URL with `normalizeStockPage(page,totalPages)`.

- [ ] **Step 3: Replace both lists with standard pagination**

Use the page query response for rows and metadata. Remove “加载更多”. Render `Pagination` only when `total > 0`, with `paginationTokens(page,totalPages)` and `stockPageRange(...)`. Show the same compact search shell from the confirmed prototype on both tabs.

- [ ] **Step 4: Preserve detail return context**

When navigating from a stock row, include `toStockDetailSearch({tab,page,q})`. In Quick Quote Detail, extend search validation for `listTab/listPage/listQ`; return uses `toStockReturnSearch()` when `from === "market-stock"`, otherwise falls back to `/home/market/stock`.

- [ ] **Step 5: Run focused tests and type check**

Run:

```bash
cd apps/web
node --test --experimental-strip-types src/lib/stock-list-state.test.ts
pnpm check-types
```

Expected: PASS.

- [ ] **Step 6: Browser-check list flow**

Run the confirmed exploration and verify:

- search `比亚迪` resets to page 1 and preserves `q`;
- switching to self-selected preserves `q` and resets page;
- page 2 changes URL and shows the correct range;
- open a row, return, and recover the previous `tab/page/q`.

Expected: no horizontal overflow, console errors or missing page controls.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/home/market/stock/index.tsx apps/web/src/routes/home/market/stock/$symbol.tsx apps/web/src/lib/stock-list-state.test.ts
git commit -m "feat(web): paginate stock list and restore detail context"
```

---

### Task 5: Quick Quote Detail 固定白色数据画布

**Files:**

- Modify: `apps/web/src/styles/themes/preline/ai-trader.css`
- Modify: `apps/web/src/index.css`
- Create: `apps/web/src/lib/quote-canvas-theme.ts`
- Create: `apps/web/src/lib/quote-canvas-theme.test.ts`
- Modify: `apps/web/src/routes/home/market/-private/FundStructure.tsx`
- Modify: `apps/web/src/routes/home/market/stock/$symbol.tsx:220-340,420-490`

**Interfaces:**

- Produces: `QuoteCanvasColors`
- Produces: `readQuoteCanvasColors(): QuoteCanvasColors`
- Produces: `quoteCanvasChartStyles(colors: QuoteCanvasColors): DeepPartial<Styles>`
- Extends `FundStructure` props with `tone?: "default" | "quoteCanvas"`.

- [ ] **Step 1: Write failing style-contract tests**

Assert the style helper maps:

```ts
const styles = quoteCanvasChartStyles({
  canvas: "#ffffff",
  surface: "#f4f6fa",
  ink: "#202a42",
  muted: "#526077",
  line: "#dde3ec",
  grid: "#e5e9f0",
  axis: "#526077",
  crosshair: "#78869c",
  tooltipBg: "#ffffff",
  tooltipBorder: "#dde3ec",
  up: "#b42333",
  down: "#08715e",
  flat: "#778399",
  ma5: "#1a1a1a",
  ma10: "#d4a017",
  ma20: "#9a4dff",
  ma30: "#2e9e5b",
  ma60: "#2f6fe0",
  ma120: "#808080",
  ma250: "#b42333",
});
assert.equal(styles.grid?.horizontal?.color, "#e5e9f0");
assert.equal(styles.xAxis?.tickText?.color, "#526077");
assert.equal(styles.crosshair?.horizontal?.line?.color, "#78869c");
assert.equal(styles.candle?.tooltip?.text?.color, "#202a42");
```

- [ ] **Step 2: Run the style tests and verify RED**

Run:

```bash
cd apps/web
node --test --experimental-strip-types src/lib/quote-canvas-theme.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Add fixed white-canvas semantic tokens**

Add quote-canvas background, surface, ink, muted, line, grid, axis, crosshair, tooltip, up/down/flat and MA tokens to the light and dark theme blocks with identical dark-mode values. Map them through `@theme inline`.

- [ ] **Step 4: Apply chart styles and fund variant**

Pass `quoteCanvasChartStyles(readQuoteCanvasColors())` to `chart.setStyles()`. Keep red-up/green-down semantics from the white-canvas-specific colors. Add a `quoteCanvas` tone to `FundStructure`; the default tone remains unchanged for board details.

- [ ] **Step 5: Wrap K-line and funds in the white data canvas**

Reorder the Quick Quote Detail as summary → K-line → funds. Apply the white canvas wrapper and class around only K-line panes and `FundStructure tone="quoteCanvas"`. Keep page navigation and actions outside it.

- [ ] **Step 6: Run focused tests and type check**

Run:

```bash
cd apps/web
node --test --experimental-strip-types src/lib/quote-canvas-theme.test.ts
pnpm check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/styles/themes/preline/ai-trader.css apps/web/src/index.css apps/web/src/lib/quote-canvas-theme.ts apps/web/src/lib/quote-canvas-theme.test.ts apps/web/src/routes/home/market/-private/FundStructure.tsx apps/web/src/routes/home/market/stock/$symbol.tsx
git commit -m "feat(web): add white quote data canvas"
```

---

### Task 6: K 线显式状态与完整验收

**Files:**

- Create: `apps/web/src/lib/kline-status.ts`
- Create: `apps/web/src/lib/kline-status.test.ts`
- Create: `apps/web/src/routes/home/market/stock/-private/KlineStatusOverlay.tsx`
- Modify: `apps/web/src/routes/home/market/stock/$symbol.tsx:80-340`
- Modify: `openspec/changes/optimize-market-center-stocks/verification.md`

**Interfaces:**

- Produces: `KlineLoadStatus = "loading" | "ready" | "empty" | "error"`
- Produces: `resolveKlineStatus(input: { bars: unknown[] | null; error: unknown | null }): KlineLoadStatus`
- `KlineStatusOverlay` consumes `status`, `onRetry` and renders only within the white data canvas.

- [ ] **Step 1: Write failing status tests**

Assert:

```ts
assert.equal(resolveKlineStatus({ bars: null, error: null }), "loading");
assert.equal(resolveKlineStatus({ bars: [], error: null }), "empty");
assert.equal(resolveKlineStatus({ bars: [{ close: 1 }], error: null }), "ready");
assert.equal(resolveKlineStatus({ bars: null, error: new Error("timeout") }), "error");
```

- [ ] **Step 2: Run the status tests and verify RED**

Run:

```bash
cd apps/web
node --test --experimental-strip-types src/lib/kline-status.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement status helper and overlay**

Track loading/ready/empty/error in the chart data loader. Render an overlay in the white data canvas for loading, empty and error. Error retry invalidates the K-line query and calls `chart.resetData()`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd apps/web
node --test --experimental-strip-types src/lib/kline-status.test.ts
pnpm check-types
```

Expected: PASS.

- [ ] **Step 5: Run real-browser acceptance**

Using `oil-ui` screenshot tooling:

- open full-market and self-selected list at page 1, middle and last page;
- test search matching and no-result;
- refresh and browser back/forward restore `tab/page/q`;
- enter Quick Quote Detail and return to the same list state;
- verify K-line, fund structure, loading/empty/error overlays;
- capture desktop `1440×900` and mobile `390×844`, light and dark;
- confirm no console errors, image failures, horizontal overflow, obscured pagination or contrast warnings.

- [ ] **Step 6: Run full verification**

```bash
pnpm --filter @ai-trader/server test
ADMIN_DB_TESTS=1 pnpm --filter @ai-trader/server test
pnpm --filter @ai-trader/web test
pnpm check-types
pnpm lint
docker compose build nginx
docker compose up -d nginx
pnpm exec openspec validate optimize-market-center-stocks --strict
git diff --check
```

Expected:

- server tests 0 failed; opt-in DB tests 0 failed;
- web tests 0 failed;
- type check and build pass;
- lint has 0 errors;
- OpenSpec strict validation passes;
- nginx serves the updated page.

- [ ] **Step 7: Write the verification report**

Record all commands, pass/fail counts, skipped checks, screenshot paths and remaining visual limitations in `verification.md`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/kline-status.ts apps/web/src/lib/kline-status.test.ts apps/web/src/routes/home/market/stock/-private/KlineStatusOverlay.tsx apps/web/src/routes/home/market/stock/$symbol.tsx openspec/changes/optimize-market-center-stocks/verification.md
git commit -m "test: verify market center stock pagination and quote canvas"
```

## Self-Review

- Spec coverage:
  - Stable full-market/watchlist pagination → Tasks 1–4.
  - Search in both scopes and URL restoration → Tasks 1–4.
  - Session-authenticated watchlist and cache isolation → Tasks 2–3.
  - White K-line and capital structure canvas → Task 5.
  - K-line loading/empty/error states → Task 6.
  - Desktop/mobile/light/dark visual acceptance → Task 6.
- Interface consistency: parser names, URL helpers, paged hooks, quote canvas style helper and K-line status names are introduced before their consumers.
- Review focus is pinned to tests in Tasks 1–6.
- No database migration or K-line contract change is included.
