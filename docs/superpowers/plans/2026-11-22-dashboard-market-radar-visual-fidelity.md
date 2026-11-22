# Dashboard Market Radar Visual Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the `/home` market radar with the confirmed v6 visual baseline while preserving real data, existing APIs, accessibility, and the Apollo Quant app shell.

**Architecture:** Keep the current data contracts and ECharts implementation. Add dashboard semantic tokens and pure formatting helpers, then recompose the A-share board, ETF card, cross-market card, SIGNAL, and today execution around the confirmed v6 hierarchy without changing backend behavior.

**Tech Stack:** React 19, TypeScript, TanStack Query, Tailwind CSS v4, Preline UI, ECharts, Node test runner

**Spec:** `openspec/changes/refine-dashboard-market-radar-visual-fidelity/specs/preline-workbench-ui/spec.md`

## Global Constraints

- Visual baseline: `docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v6.html`.
- Scope: only the `/home` daily dashboard content area.
- Preserve the Apollo Quant brand, sidebar, page-level navigation, routes, authentication, API contracts, and database behavior.
- Use Preline semantic CSS variables and Tailwind utilities; do not add raw hex colors to dashboard business components.
- Do not copy v6 sample prices, sample confidence, sample tasks, or any static market data.
- Do not restore the confirmed-removed “追问 AI” control.
- Keep the existing `DASHBOARD_MARKET_RADAR_ENABLED` rollback.
- Desktop reference: `1440×900`; wide content cap: about `1500px`; mobile reference: `390×844`.
- Motion must remain disabled or reduced according to existing accessibility behavior.

## Review Focus

- Real symbol names and long prices must not collide with code, unit, or change labels in desktop or mobile cards.
- Missing or stale A-share, ETF, cross-market and today-execution data must preserve card geometry and retry behavior.
- ETF rows, range controls, and charts must remain operable by keyboard after visual restructuring.
- Dark mode must retain readable surface separation, signal gradient contrast, chart grids, and state colors.
- Feature-flag rollback must continue to show the previous dashboard without issuing market-radar queries.

---

### Task 1: Add Dashboard Semantic Tokens and Formatting Helpers

**Files:**

- Modify: `apps/web/src/styles/themes/preline/ai-trader.css`
- Modify: `apps/web/src/lib/market-brief.ts`
- Modify: `apps/web/src/lib/market-brief.test.ts`

**Interfaces:**

- Produces: `formatChangePct(value: number | null): string`.
- Produces tokens: `--dashboard-a-wash`, `--dashboard-global-wash`, `--dashboard-etf-wash`, `--dashboard-signal-start`, `--dashboard-signal-end`, `--dashboard-shadow`.

- [ ] **Step 1: Write failing formatter tests**

Add tests asserting:

```ts
assert.equal(formatChangePct(-1.234), "-1.23%");
assert.equal(formatChangePct(null), "—");
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts`

Expected: FAIL because the formatter export does not exist.

- [ ] **Step 3: Implement the pure helpers**

Use two decimals for percentage changes and return `—` for null or non-finite input.

- [ ] **Step 4: Add semantic dashboard tokens**

Add light and dark tokens to `ai-trader.css` for A-share wash, global wash, ETF wash, signal gradient endpoints, and soft shadow. Expose only the needed colors through `@theme inline`; retain the existing Preline token system.

- [ ] **Step 5: Run focused tests and checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS with 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles/themes/preline/ai-trader.css apps/web/src/lib/market-brief.ts apps/web/src/lib/market-brief.test.ts
git commit -m "feat: add dashboard visual fidelity tokens"
```

### Task 2: Rebuild the A-share Header and Quote Overview

**Files:**

- Modify: `apps/web/src/routes/home/-private/AShareMarketBoard.tsx`
- Modify: `apps/web/src/routes/home/-private/MarketRadarHero.tsx`
- Create: `apps/web/src/routes/home/-private/AShareIndexOverview.tsx`

**Interfaces:**

- Consumes: existing `MarketBriefResponse`, selected A-share symbol, and `onSelectSymbol`.
- Produces: `AShareIndexOverview({ data, selectedSymbol, onSelectSymbol })`.
- Produces a two-button quote overview that remains a direct A-share switch.

- [ ] **Step 1: Add a failing interaction contract test**

Extend `market-selection.test.ts` with a test that selecting `399006.SZ` changes only the index symbol:

```ts
assert.deepEqual(
  reduceMarketSelection(initialMarketSelection(), {
    type: "index",
    symbol: "399006.SZ",
  }),
  {
    ...initialMarketSelection(),
    symbol: "399006.SZ",
  },
);
```

- [ ] **Step 2: Run the test to verify RED if the existing behavior changes**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-selection.test.ts`

Expected: PASS if existing isolation is already correct; keep the test as regression coverage.

- [ ] **Step 3: Implement the quote overview and recompose the board header**

Show both index names, codes, prices and changes. Use the selected quote block as the A-share switch, remove the duplicate tab control, and place range controls beside the chart metadata. Use semantic dashboard tokens for the A-share wash.

- [ ] **Step 4: Run focused checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-selection.test.ts src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/home/-private/AShareMarketBoard.tsx apps/web/src/routes/home/-private/AShareIndexOverview.tsx apps/web/src/routes/home/-private/MarketRadarHero.tsx apps/web/src/lib/market-selection.test.ts
git commit -m "feat: align a-share market radar header"
```

### Task 3: Implement the Shared v6 Chart Grammar

**Files:**

- Modify: `apps/web/src/components/charts/MarketAssetChart.tsx`
- Modify: `apps/web/src/lib/market-brief.ts`
- Modify: `apps/web/src/lib/market-brief.test.ts`
- Modify: `apps/web/src/routes/home/-private/AShareMarketBoard.tsx`
- Modify: `apps/web/src/routes/home/-private/ETFContextCard.tsx`
- Modify: `apps/web/src/routes/home/-private/GlobalContextCard.tsx`

**Interfaces:**

- Extend `MarketAssetChartProps` with `referencePrice?: number | null`.
- Preserve `chart`, `subjectName`, and `compact`.
- Produce ECharts markLine and legend without changing chart data contracts.

- [ ] **Step 1: Write failing chart-format tests**

Add assertions for axis number formatting:

```ts
assert.equal(formatChartAxisValue(3533.79), "3,534");
assert.equal(formatChartAxisValue(4.018), "4.02");
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts`

Expected: FAIL because `formatChartAxisValue` is missing.

- [ ] **Step 3: Implement `formatChartAxisValue` and chart presentation**

Pass the selected ticker's `preClose` to the chart. Add a dashed reference line when available, a series legend, a subtle gradient area, stronger volume bars, and theme-aware axes. Keep the existing keyboard live region, tooltip and reduced-motion behavior.

- [ ] **Step 4: Run focused checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/charts/MarketAssetChart.tsx apps/web/src/lib/market-brief.ts apps/web/src/lib/market-brief.test.ts apps/web/src/routes/home/-private/AShareMarketBoard.tsx apps/web/src/routes/home/-private/ETFContextCard.tsx apps/web/src/routes/home/-private/GlobalContextCard.tsx
git commit -m "feat: unify market radar chart grammar"
```

### Task 4: Restore ETF Quote Rows and Cross-market Styling

**Files:**

- Modify: `apps/web/src/routes/home/-private/ETFContextCard.tsx`
- Modify: `apps/web/src/routes/home/-private/GlobalContextCard.tsx`
- Modify: `apps/web/src/lib/market-selection.test.ts`

**Interfaces:**

- ETF row selection dispatches the existing `{ type: "etf", symbol }` action.
- ETF keyboard navigation continues to consume `onTabKeyDown`.
- Range buttons remain scoped to the active ETF.

- [ ] **Step 1: Add failing regression assertions**

Extend the existing ETF keyboard test to assert that changing ETF does not change the index or global symbol:

```ts
assert.equal(after.symbol, before.symbol);
assert.equal(after.globalSymbol, before.globalSymbol);
```

- [ ] **Step 2: Run tests**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-selection.test.ts`

Expected: PASS if existing reducer isolation is correct; retain the assertions.

- [ ] **Step 3: Implement the v6 ETF and cross-market composition**

Render all three ETF quote rows with name, code, price and change above the selected chart. Add the `ETF 走势` and `独立行情` labels, use the ETF semantic wash, and align the cross-market header/chart/footer to the same surface grammar.

- [ ] **Step 4: Run focused checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-selection.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/home/-private/ETFContextCard.tsx apps/web/src/routes/home/-private/GlobalContextCard.tsx apps/web/src/lib/market-selection.test.ts
git commit -m "feat: align etf and cross-market observation cards"
```

### Task 5: Reformat SIGNAL for v6 Readability

**Files:**

- Modify: `apps/web/src/routes/home/-private/AShareSignalPanel.tsx`
- Modify: `apps/web/src/routes/home/-private/AShareMarketBoard.tsx`
- Modify: `apps/web/src/lib/market-brief.test.ts`

- [ ] **Step 1: Add failing score-display assertions**

Add tests that verify long factor scores are formatted without float tails:

```ts
assert.equal(formatFactorScore(26.516202596626652), "27");
assert.equal(formatFactorScore(null), "缺失");
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts`

Expected: FAIL because `formatFactorScore` is missing.

- [ ] **Step 3: Implement `formatFactorScore` and recompose the panel**

Round finite scores to integers and render missing scores as `缺失`. Use the v6 signal gradient, place confidence at top right, make the evidence body readable, render compact integer factor pills and retain the selected-index trend caption. Keep low-quality panels on a neutral semantic surface.

- [ ] **Step 4: Run focused checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/home/-private/AShareSignalPanel.tsx apps/web/src/routes/home/-private/AShareMarketBoard.tsx apps/web/src/lib/market-brief.test.ts
git commit -m "feat: align dashboard signal presentation"
```

### Task 6: Restore Today Workflow Summary and Stable Execution Geometry

**Files:**

- Modify: `apps/web/src/routes/home/-private/TodayExecutionSection.tsx`
- Modify: `apps/web/src/lib/work-tasks.ts`
- Modify: `apps/web/src/lib/work-tasks.test.ts`

**Interfaces:**

- Consumes: current `useWorkTasks`, `useTodayWorkflowRunsQuery`, and `useWorkflowsQuery`.
- Produces: `formatWorkflowSuccessRate(runs: readonly { status: string }[]): string`.

- [ ] **Step 1: Add failing workflow-summary tests**

Cover:

```ts
assert.equal(formatWorkflowSuccessRate([]), "—");
assert.equal(formatWorkflowSuccessRate([{ status: "success" }, { status: "failed" }]), "50%");
assert.equal(formatWorkflowSuccessRate([{ status: "running" }]), "—");
```

- [ ] **Step 2: Run tests**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/work-tasks.test.ts`

Expected: FAIL because `formatWorkflowSuccessRate` is missing.

- [ ] **Step 3: Implement `formatWorkflowSuccessRate` and the v6 today execution layout**

Exclude non-terminal runs from the success-rate denominator and return `—` for an empty denominator. Add three workflow metrics above the recent list, preserve the list/empty/error states inside the same card geometry, align both cards to equal minimum height, and keep task-detail links and retry buttons.

- [ ] **Step 4: Run focused checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/work-tasks.test.ts src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/home/-private/TodayExecutionSection.tsx apps/web/src/lib/work-tasks.ts apps/web/src/lib/work-tasks.test.ts
git commit -m "feat: align today execution cards"
```

### Task 7: Align Dashboard Page Header, Width, and State Geometry

**Files:**

- Modify: `apps/web/src/routes/home/-private/DailyDashboard.tsx`
- Modify: `apps/web/src/routes/home/-private/MarketRadarHero.tsx`
- Modify: `apps/web/src/lib/market-brief.ts`
- Modify: `apps/web/src/lib/market-brief.test.ts`

- [ ] **Step 1: Add failing header-date tests**

Verify the v6-style header derives from the latest market snapshot rather than the browser calendar:

```ts
assert.deepEqual(
  formatMarketBriefDate("2026-11-20T08:14:27.000Z"),
  { weekday: "FRI", date: "11.20" },
);
```

- [ ] **Step 2: Run tests**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts`

Expected: FAIL because `formatMarketBriefDate` is missing.

- [ ] **Step 3: Implement `formatMarketBriefDate` and apply page-level fidelity changes**

Use `Asia/Shanghai` to derive weekday and month/day from the market snapshot. Use that date in the eyebrow, reduce the visual prominence of the snapshot/review actions, keep the `1500px` max width, preserve stable loading skeletons, and ensure missing data does not change the grid structure.

- [ ] **Step 4: Run focused checks**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/home/-private/DailyDashboard.tsx apps/web/src/routes/home/-private/MarketRadarHero.tsx apps/web/src/lib/market-brief.ts apps/web/src/lib/market-brief.test.ts
git commit -m "feat: align dashboard page composition"
```

### Task 8: Run Full Verification and Produce Visual Evidence

**Files:**

- Create: `openspec/changes/refine-dashboard-market-radar-visual-fidelity/verification.md`
- Create: `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/visual-fidelity/` evidence files.

- [ ] **Step 1: Run automated checks**

Run:

```bash
cd apps/web && pnpm test && pnpm check-types && pnpm lint && pnpm build
```

Expected: tests pass, types pass, lint has 0 errors, production build succeeds.

- [ ] **Step 2: Run the real Docker stack**

Use the current public compose stack with real PostgreSQL data and `DASHBOARD_MARKET_RADAR_ENABLED=true`. Verify `/api/v1/dashboard/market-brief` returns three charts and real data.

- [ ] **Step 3: Capture required screenshots**

Capture:

- Desktop `1440×900`, light and dark.
- Wide desktop with the content capped near `1500px`.
- Mobile `390×844`, light and dark.
- ETF row selection and range isolation.
- Chart keyboard focus.
- Loading, missing, stale, partial-success and error states.

- [ ] **Step 4: Measure and inspect**

Verify no horizontal overflow, no console errors, no failed images, keyboard focus visibility, and A-share/right-stack height alignment. Record actual measurements and any residual `oil-ui` lint findings in `verification.md`.

- [ ] **Step 5: Commit verification**

```bash
git add openspec/changes/refine-dashboard-market-radar-visual-fidelity/verification.md docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/visual-fidelity
git commit -m "test: verify dashboard market radar visual fidelity"
```

## Workflow Follow-up

- Stop after Task 8 for user visual acceptance.
- Run code review after acceptance.
- Archive only after a separate user confirmation.
