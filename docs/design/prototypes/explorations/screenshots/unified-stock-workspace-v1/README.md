# Unified Stock Workspace Visual Exploration

## Scope

- User task: inspect one stock and choose between a fast market view and deeper
  research without losing the stock identity, quote, K-line context, or return
  path.
- Primary viewport: `1440×900`; responsive check: `390×844`.
- Visual north star: one stock, two research depths. The stock identity and
  mode switch lead; the fast chart and progressive research feel like one quiet
  research instrument rather than two stitched pages.
- Production-aligned baseline:
  `../../live-market-stock-detail-signals-v1.html` and
  `../../live-stock-analysis-signals-judgments-v1.html`.
- Exploration:
  `../../unified-stock-workspace-v1.html`.

## Visual Decisions

- The stock identity header appears once and owns the name, code, quote,
  trading status, watchlist, comparison, and overflow actions.
- `快速看盘 / 深度研究` is the only mode switch. It is placed immediately below
  the shared header and stays available while scrolling.
- Quick mode combines the full K-line, fund context, and a single continuous
  quick-judgment rail instead of several unrelated cards.
- Research mode keeps a compact “行情底稿” band before the research content.
  A research request can load or fail independently without removing the market
  context or the page navigation.
- The canonical route is represented as
  `/home/market/stock/:symbol?mode=quick|research`; the prototype uses the
  local `state` parameter only to expose review states.
- A-share red-up/green-down remains reserved for price direction. Blue carries
  interaction and research structure; amber carries partial, stale, or missing
  data.

## Evidence

### Light

`light/` contains desktop and mobile captures for:

- `quick`
- `research`
- `loading`
- `error`
- `partial`
- `market-missing`

### Dark

`dark/` contains the same six states at both target viewports.

### Interaction

- `interactions/page-切换到深度研究-1440x900.png`
- `interactions/page-切换到深度研究-390x844.png`
- `interactions/page-返回快速看盘-1440x900.png`
- `interactions/page-返回快速看盘-390x844.png`
- `keyboard/page-键盘聚焦深度研究-1440x900.png`
- `keyboard/page-键盘聚焦深度研究-390x844.png`

The interaction captures start from quick mode, switch to research in place,
return to quick, and tab from the selected quick control to the research
control.

### Full Research Region

- `details/light/research.png`
- `details/dark/research.png`

These selector captures include the modules below the initial viewport so
auxiliary-text contrast is checked across the full research content, not only
the first screen.

## Automated Checks

- Real-browser captures at `1440×900` and `390×844`.
- Light and dark reports: zero console errors, zero failed images, zero
  page-level horizontal overflow, and zero lint findings.
- Interactive and keyboard captures: zero console errors, zero failed images,
  zero page-level horizontal overflow, and zero lint findings.
- Full light and dark research-region captures: zero console errors, zero failed
  images, zero page-level horizontal overflow, and zero lint findings.
- Mode controls expose `aria-pressed`; the native focus ring is visible without
  replacing the active state.
- The prototype includes a `prefers-reduced-motion: reduce` rule that removes
  transitions and repeated animation. Runtime motion preference still requires
  production-browser verification.

## Limitations

- Quotes, funds, forecasts, financial values, and research events are
  representative interface data, not a live market or model run.
- The zrok reference supplied by the user was not used for automated capture
  because its safety interstitial blocked the browser; the repository’s latest
  production-aligned snapshots were used instead.
- Lazy import timing, query caching, old-URL redirects, and production browser
  history restoration remain implementation checks after visual confirmation.
- The current review covers the unified-page visual direction only. It does not
  confirm the separate five-day forecast visual exploration.

## Review

Initial independent review: **8/10**. It found five actionable issues:

1. Mobile research content and failure actions were below the first viewport.
2. Mobile mode copy could break in the middle of “44 项信号”.
3. The fixed AI assistant button covered fund values in the desktop quick rail.
4. Auxiliary text in modules below the viewport had insufficient contrast.
5. Normal-state copy explained the system instead of summarizing stock data.

The final implementation:

- compresses the mobile market strip and exposes the research conclusion or
  failure panel in the first viewport;
- keeps “预测与风险 / 44 项信号 / 财务与事件” as complete inline phrases;
- reserves desktop space beside fund values for the assistant button;
- strengthens auxiliary text tokens and verifies the full research region in
  both themes;
- replaces normal-state system copy with price, fund, evidence, and update
  summaries.

Visual closure review: **9/10**, no remaining blockers; approved for user
visual-direction confirmation.

Visual direction confirmation: pending.
