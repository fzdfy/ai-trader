# 每日看板 v6 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已确认的 v6 视觉稿实现为生产 React 页面：A 股主控台在左，跨市场与 ETF 两张 Tab 卡在右并等高，今日行动与今日工作流在下方并列。

**Architecture:** Market Brief、Work Task 和 Workflow Run 使用三个并行查询域。页面私有组件分别负责 A 股主控台、SIGNAL、ETF、跨市场和今日执行，`DailyDashboard` 只做组合与 feature flag 回退。图表复用现有 ECharts 包和 Preline 语义 token。

**Tech Stack:** React 19、TanStack Query、Tailwind CSS v4、Preline UI、ECharts 6、Node test runner、Vite。

**Spec:** `docs/superpowers/specs/2026-11-22-dashboard-market-radar-design.md`

## Global Constraints

- 已确认原型为 `docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v6.html`，不得重新决定模块位置。
- 桌面 `1440×900`：左侧 A 股主控台与右侧两卡组合高度必须一致，底边差值为 `0px`；移动端自然单列。
- 右侧顺序固定为跨市场背景、主流 ETF；ETF Tab 顺序固定为沪深300ETF、科创50ETF、创新药ETF。
- 今日行动只使用 `useWorkTasks`；今日工作流只使用 `useTodayWorkflowRunsQuery` 与 `useWorkflowsQuery`。
- 三个 range 状态独立；切换 ETF 不得改变 SIGNAL，切换任一卡不得改变其他卡片。
- 使用 Preline 语义组件和 CSS token；禁止 raw hex、重复图表库或整段复制原型 HTML。
- 所有 Tab 支持点击、左右方向键、Home/End 和可见焦点。
- loading、empty、missing、stale、partial-success、error 必须有可区分文案。
- feature flag 关闭时渲染现有旧看板，零行为变化。

## Review Focus

- 桌面等高依赖额外 wrapper 导致左侧只按内容高度结束 → 浏览器测量左右底边差必须为 `0px`。
- ETF Tab 重渲染后焦点丢失 → 测试点击和方向键后 active tab 保持焦点。
- 任一查询失败使整页报错 → 测试 Market Brief、Work Task、Workflow Run 分别失败时其他区域仍显示。
- 伦敦金或 ETF 被误算入 A 股信号 → 测试切换它们时 SIGNAL props 不变。
- 移动端为追求等高压缩图表和文本 → 390px 下自然单列且无横向溢出。

### Task 1: Query contracts, hooks, and pure helpers

**Files:**

- Create: `apps/web/src/hooks/useMarketBrief.ts`
- Create: `apps/web/src/hooks/useSystemFeatures.ts`
- Create: `apps/web/src/lib/market-brief.ts`
- Create: `apps/web/src/lib/market-brief.test.ts`

**Interfaces:**

- Produces `MarketBriefQueryParams`, `MarketBriefResponse`, `MarketChart`, `MarketTick`, `MarketSignal`.
- Produces `useMarketBriefQuery(params)` and `useSystemFeaturesQuery()`.
- Produces `nextMarketTab(symbols, current, key)`.
- Produces `formatMarketPrice(value, unit)` and `marketQualityLabel(quality, staleReason)`.
- Produces `canRenderMarketChart(chart)`.

- [ ] **Step 1: Write failing pure helper tests**

```ts
test("ETF arrow keys wrap and preserve symbol order", () => {
  const symbols = ["510300.SH", "588000.SH", "159992.SZ"] as const;
  assert.equal(nextMarketTab(symbols, "510300.SH", "ArrowLeft"), "159992.SZ");
  assert.equal(nextMarketTab(symbols, "159992.SZ", "ArrowRight"), "510300.SH");
});

test("unknown market quality never renders as available", () => {
  assert.equal(marketQualityLabel("missing", null), "暂不可用");
});
```

另测价格单位、缺失值显示 `—`、少于两个点时 `canRenderMarketChart()` 返回 false。

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts`

Expected: FAIL because helpers are missing.

- [ ] **Step 3: Implement types, helpers, and TanStack hooks**

`useMarketBriefQuery` 使用带参数的稳定 query key 和 `AbortSignal`；`useSystemFeaturesQuery` 读取 `/api/v1/system/features`。不把 Work Task 或 Workflow Run 加入 Market Brief hook。

- [ ] **Step 4: Run tests and type check**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts && pnpm check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks apps/web/src/lib/market-brief.ts apps/web/src/lib/market-brief.test.ts
git commit -m "feat: add dashboard market brief queries"
```

### Task 2: Accessible market chart

**Files:**

- Create: `apps/web/src/components/charts/MarketAssetChart.tsx`
- Modify: `apps/web/src/styles/themes/preline/ai-trader.css`

**Interfaces:**

- Consumes: `MarketChart`.
- Produces: `MarketAssetChart({ chart, subjectName, compact? }): JSX.Element`.
- Supports volume only when `chart.hasVolume`; missing data renders empty state instead of axes.

- [ ] **Step 1: Add a failing missing-data render contract**

在现有组件测试体系可用时，最少测试 `chart.points.length < 2` 返回空态标题“历史行情不足”。若当前没有 React DOM 测试依赖，则保留 pure helper `canRenderMarketChart(chart)` 并在 Task 1 测试文件中覆盖；不新增测试依赖。

- [ ] **Step 2: Run focused contract test and verify RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts`

Expected: FAIL until `canRenderMarketChart` exists.

- [ ] **Step 3: Implement ECharts chart**

复用 `apps/web/src/lib/echarts.ts`；使用折线、可选成交量、十字线和 tooltip。主题色全部来自 `--chart-*` 语义变量。监听容器 resize，卸载时 `dispose()`，并遵守 `prefers-reduced-motion`。

- [ ] **Step 4: Run tests and type/lint checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts/MarketAssetChart.tsx apps/web/src/styles/themes/preline/ai-trader.css
git commit -m "feat: add market asset chart"
```

### Task 3: A-share, ETF, and cross-market cards

**Files:**

- Create: `apps/web/src/routes/home/-private/MarketRadarHero.tsx`
- Create: `apps/web/src/routes/home/-private/AShareMarketBoard.tsx`
- Create: `apps/web/src/routes/home/-private/AShareSignalPanel.tsx`
- Create: `apps/web/src/routes/home/-private/ETFContextCard.tsx`
- Create: `apps/web/src/routes/home/-private/GlobalContextCard.tsx`
- Create: `apps/web/src/lib/market-selection.ts`
- Create: `apps/web/src/lib/market-selection.test.ts`
- Modify: `apps/web/src/routes/home/-private/DailyDashboard.tsx`

**Interfaces:**

- `MarketRadarHero` consumes Market Brief data and selected ranges.
- `AShareMarketBoard` owns index selection and A-share range.
- `ETFContextCard` owns ETF Tab and range.
- `GlobalContextCard` owns cross-market Tab and range.
- `AShareSignalPanel` consumes only `signal`.
- Produces: `MarketSelectionState = { indexSymbol; indexRange; etfSymbol; etfRange; globalSymbol; globalRange }`.
- Produces: `reduceMarketSelection(state, action): MarketSelectionState`.

- [ ] **Step 1: Write failing selection reducer tests**

断言 ETF 左右方向键循环、Home/End 跳转、单卡 range 更新，以及更新 ETF 时 A 股和跨市场字段保持不变。

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-selection.test.ts`

Expected: FAIL because the reducer is missing.

- [ ] **Step 3: Implement reducer and cards with Preline semantics**

A 股卡只显示上证/创业板；ETF 卡显示三个横向 Tab；跨市场卡显示伦敦金/纳指。三张卡都有独立 range 按钮和图表质量文案。ETF 与跨市场卡必须明确“不进入 A 股 SIGNAL”。

- [ ] **Step 4: Implement layout**

桌面使用近似 `minmax(0,1.72fr) / minmax(300px,.78fr)` 双列；右列为 `h-full grid grid-rows-[auto_minmax(0,1fr)]`。A 股卡作为第一列直接 grid child，不增加中间高度 wrapper。小于 `xl` 时单列。

- [ ] **Step 5: Run tests, type, and lint checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-selection.test.ts src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/home/-private apps/web/src/components/charts
git commit -m "feat: build market radar hero"
```

### Task 4: Today execution section

**Files:**

- Create: `apps/web/src/routes/home/-private/TodayExecutionSection.tsx`
- Modify: `apps/web/src/lib/market-brief.ts`
- Modify: `apps/web/src/lib/market-brief.test.ts`
- Modify: `apps/web/src/routes/home/-private/DailyDashboard.tsx`

**Interfaces:**

- Consumes: `useWorkTasks("today", localDate, timezone)`, `useTodayWorkflowRunsQuery()`, `useWorkflowsQuery()`.
- Produces two independent columns/cards: 今日行动, 今日工作流.
- Work Task max 3 by `dueTime`; Workflow Run max 3 by `createdAt`.
- Produces: `orderTodayWorkTasks(items)` and `latestThreeWorkflowRuns(items)`.

- [ ] **Step 1: Write failing pure ordering tests**

在 `market-brief.test.ts` 断言 Work Task 按到期时间排序、Workflow Run 按最近时间排序，且输入数组不被修改。

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts`

Expected: FAIL because ordering helpers are missing.

- [ ] **Step 3: Implement the two cards**

今日行动只渲染 Work Task，包含完成态、空态和错误重试；今日工作流只渲染 Workflow Run，包含运行状态、空态和错误重试。两个查询互不依赖。

- [ ] **Step 4: Run tests and type/lint checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/home/-private apps/web/src/lib/market-brief.ts
git commit -m "feat: add today execution section"
```

### Task 5: Integrate daily dashboard and feature rollback

**Files:**

- Modify: `apps/web/src/routes/home/-private/DailyDashboard.tsx`
- Modify: `apps/web/src/hooks/useDashboard.ts`
- Modify: `apps/web/src/hooks/useSystemFeatures.ts`

**Interfaces:**

- When `dashboardMarketRadar=true`, render hero + Today Execution + existing modules.
- When false, render existing dashboard with no new queries.

- [ ] **Step 1: Write failing query-gating helper test**

在 `market-brief.test.ts` 覆盖 `shouldLoadMarketRadar(features)`，未知或 false 返回 false。

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts`

Expected: FAIL because gating helper is missing.

- [ ] **Step 3: Integrate modules**

feature flag false：保持当前组件和请求完全不变。true：先渲染 Market Radar Hero，再 Today Execution，再市场证据、研究准备、最近复盘。旧模块内容全部保留。

- [ ] **Step 4: Run checks and production build**

Run: `cd apps/web && pnpm test && pnpm check-types && pnpm lint && pnpm build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/home/-private/DailyDashboard.tsx apps/web/src/hooks
git commit -m "feat: integrate v6 daily dashboard"
```

### Task 6: Real-browser visual and interaction verification

**Files:**

- Create: `openspec/changes/add-dashboard-market-radar/screenshots/` evidence copies when approved.
- Modify: `openspec/changes/add-dashboard-market-radar/verification.md`

**Interfaces:**

- Consumes all previous tasks.
- Produces desktop/mobile, light/dark, keyboard fallback and degraded-state evidence.

- [ ] **Step 1: Run the app with the feature flag enabled**

Run the documented local stack and open `/home` with `DASHBOARD_MARKET_RADAR_ENABLED=true`.

- [ ] **Step 2: Capture standard and interaction views**

Capture desktop `1440×900` and mobile `390×844` in light/dark; capture ETF Tab arrow navigation, cross-market Tab, missing quote, stale chart, signal missing, Work Task error and Workflow error.

- [ ] **Step 3: Measure layout**

In the browser evaluate `.mr-a-board` and the right stack bottom coordinates. Expected: `bottomDelta = 0`; mobile `grid-template-columns` is single column.

- [ ] **Step 4: Run final checks**

Run:

```bash
cd apps/web && pnpm test && pnpm check-types && pnpm lint && pnpm build
cd ../server && pnpm test && pnpm check-types && pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Write verification evidence and commit**

Record commands, exit results, screenshots, known gaps and feature flag rollback in `verification.md`.

```bash
git add openspec/changes/add-dashboard-market-radar
git commit -m "test: verify dashboard market radar"
```
