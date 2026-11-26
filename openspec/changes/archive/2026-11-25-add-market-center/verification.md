# Verification

Date: 2026-11-24

## Result

行情中心已按确认视觉稿完成生产实现并部署到本机容器。自动测试、类型检查、生产构建、真实 API、桌面/移动端和浅色/深色页面均已验证。没有发现仍需修复的 Critical 或 Important 问题。

Visual design: required and applied. 行情中心基准为
`docs/design/prototypes/initial/quant-workbench-market-center-v1.html`；
本次主要指数改版以
`docs/design/prototypes/explorations/quant-workbench-market-center-main-indices-v1.html`
为视觉标准。

## Automated checks

| Check | Result |
|---|---|
| Quant unittest | `55/55` passed |
| Server test | `268` total, `218` passed, `50` opt-in admin/workflow tests skipped, `0` failed |
| Web test | `89/89` passed |
| `pnpm check-types` | Server + Web, `2/2` successful |
| `pnpm lint` | `0` errors; `35` pre-existing repository warnings |
| `pnpm build` | Successful; only the existing large-chunk warning |
| Docker production build | `server`, `worker`, `quant` and `nginx` built and restarted successfully |

Server tests were run with `DATABASE_URL` pointed at the local PostgreSQL container so the database-backed tests executed rather than failing on sandbox socket permissions.

## API evidence

Final public container checks:

```text
overview: quotes=7, breadth=available, limitUp=available,
          anomalies=5, growth=available, errors=[]
industry rotation: available, asOf=2026-11-23, rows=496
concept rotation: available, asOf=2026-11-23, rows=554
asset rotation: available, asOf=2026-11-23, rows=3,
                IXIC missing because its daily history has fewer than 2 sessions
```

Growth/defense verified with real data:

```text
ratio=0.1918753577106518
state=中间区
1500d percentile=0.29338842975206614
20D relative return=-17.901887631507986%
```

Legacy `/home/signals/heatmap?tab=concept` resolves to:

```text
/home/market/boards?type=concept&window=20D
```

## Visual and interaction evidence

Screenshots are in `docs/design/prototypes/explorations/screenshots/market-center-v1/production/`.

- Overview: light/dark desktop, light/dark mobile, loading, empty watchlist and partial asset rotation.
- Boards: industry light/dark desktop, light/dark mobile.
- Board detail: light/dark desktop and light mobile, including rotation, fund structure and constituents when the fund source is available.
- Stocks: light/dark desktop and light mobile; row click enters the existing K-line detail.
- Stock detail: light/dark desktop and light mobile; fund structure is above the preserved `klinecharts` candle/MACD/VOL chart.
- K-line canvas measured non-zero at desktop and mobile widths; the title uses the Chinese instrument name and ticker.
- Mobile `390×844` checks reported `scrollWidth=390`, so there was no page-level horizontal overflow.
- Browser console error log was empty during the production walkthrough.
- Industry/concept selection, 5/20/60-day rotation windows, asset quote/relative-strength mode, board detail, stock detail, breadcrumbs and legacy deep links were exercised in the production page.

The approved exploration also contains the designed loading, empty, error and partial-success states. Production captures additionally exercised loading, empty watchlist and partial asset rotation directly.

## Code review and fixes

Self-review was used because this turn did not authorize delegated subagents. The following defects were found and fixed:

1. Industry/concept rotation originally read only three `board_history` dates; it now derives long-window rotation from `board_kline` without inventing missing history.
2. Asset rotation silently dropped IXIC; it now returns explicit missing evidence.
3. Overview incorrectly labeled a positive net inflow as outflow when a category had no negative value; direction is now validated before creating a rule anomaly.
4. `/home/market/boards/$code` was shadowed by the old leaf route implementation; the boards entry was moved to `boards/index.tsx` so the detail route renders.
5. The K-line container mounted after the feature-gate shell and initialized at zero height; explicit layout sizing and a post-mount resize restore the existing `klinecharts` rendering path.
6. The instrument name could be stale when the chart mounted late; chart initialization now reads the latest target snapshot.
7. Fund structure now distinguishes loading, read failure and true empty data instead of treating an in-flight request as no data.
8. Overview source status now reflects degraded quote/breadth/limit-up/growth/asset sections rather than claiming all domains are healthy.

## Remaining notes

- `pnpm lint` still reports 35 warnings in unrelated existing files or pre-existing patterns; there are no lint errors.
- The quant fund-flow upstream intermittently returned an empty list during the final mobile capture. The page correctly shows “暂无资金快照” and does not synthesize zero values. Earlier production screenshots captured available fund structures for stock and board details.
- K-line rendering is validated through the real production canvas; the repository has no component-level browser test for `klinecharts` sizing.
- No independent fresh-context visual reviewer was available in this non-delegated turn; the implementation received a self visual review against the confirmed initial baseline.

## Workflow status

Implementation is complete and ready for user acceptance. OpenSpec archive remains intentionally pending until the user separately confirms receipt and acceptance.

## Main Index Refinement

Date: 2026-11-24

### Automated checks

| Check | Result |
|---|---|
| Quant unittest | `55/55` passed |
| Server test | `268` total, `218` passed, `50` opt-in admin/workflow tests skipped, `0` failed |
| Web test | `89/89` passed |
| `pnpm check-types` | Server + Web, `2/2` successful |
| `pnpm lint` | `0` errors; `35` pre-existing repository warnings |
| `pnpm build` | Successful; only the existing large-chunk warning |
| `pnpm exec openspec validate add-market-center --strict` | Valid |
| Docker production build | `server`, `worker`, `quant` and `nginx` rebuilt; `server`, `worker`, `quant`, `nginx` recreated |

Main-index targeted tests:

```text
quant index rotation: 8/8 passed
server benchmark/quote/API/store/sync: 20/20 passed
web market-center contracts: 14/14 matched tests passed in the full 89-test run
```

### API evidence

Real production response after rebuild:

```text
overview.mainIndices.status=available
overview.mainIndices.asOf=2026-11-24
overview.mainIndices.items=7
codes=000001.SH,000300.SH,000905.SH,000852.SH,399673.SZ,000688.SH,930955.CSI
trend points per index=28
sources=tencent × 6, csindex × 1
errors=[]

scope=main-benchmark&window=20D
status=available
asOf=2026-11-24
benchmark=000001.SH -2.74%
validStyleCount=6
1 930955.CSI +4.84pct
2 000688.SH +2.57pct
3 000300.SH +0.62pct
4 000905.SH -3.39pct
5 000852.SH -7.03pct
6 399673.SZ -9.92pct
```

Growth/defense remains independent and returned `0.1930`, `中间区`,
`31.8%` 1500-day percentile and `-14.5%` 20-day relative return.
Cross-asset rotation returned three available rows and kept the missing
IXIC row out of the ranking with no fabricated zero.

### Visual and interaction evidence

Production screenshots are in
`docs/design/prototypes/explorations/screenshots/market-center-main-indices-v1/production/`.

- Light and dark, desktop and mobile, quote and relative modes captured.
- Desktop main-index height is `805px` in both modes.
- Mobile main-index height is `1269px` in both modes.
- `scrollWidth` equals the viewport width at `1440px` and `390px`.
- Mode switching preserves the focused control; Tab reaches the relative
  window selector and shows a visible focus ring.
- The independent cross-asset window switch changed only cross-asset
  values.
- The existing stock K-line detail was reopened in production: all
  `klinecharts` canvases had non-zero width and height, `scrollWidth=1440`,
  and the browser console error log was empty.
- The boards module still loaded industry ranking, heatmap, rotation and
  anomalies with real data.

The confirmed exploration still owns the loading, empty, error, partial,
stale and insufficient-sample screenshots. Service tests cover those
behavioral branches without mutating production data to force them live.

### Self-review

No Critical or Important defects remained. The review checked fixed ordering,
missing slots, source/date provenance, common-date alignment, minimum peer
count, equal layout heights, keyboard focus, independent cross-asset
controls, backend callers and existing K-line rendering.

### Remaining notes

- `0.1930` growth/defense and the relative values above are observations,
  not recommendations.
- Realtime index business dates are shown per item; the dividend index
  remains explicitly labelled as official daily close.
- The repository lint baseline remains warning-only; this change added no
  lint errors.
- OpenSpec archive remains pending separate user acceptance.

## Market Overview Style Refinement

The overview was rechecked against the confirmed main-index design on
2026-11-24.

- Industry breadth now uses the 496 industry rows rather than adding the 554
  concept rows.
- The breadth strip derives a live narrative. The current sample is
  `行业广度偏弱，防守风格继续领先`; a unit test covers the design's
  `行业广度偏强，成长风格继续领先` case.
- Growth/defense now includes the low/neutral/high ratio band and retains
  the 20D, current-state and data-date values.
- Market temperature now uses `封板率` instead of `开板样本`.
- Industry fund and concept fund evidence now sit above
  `涨停行业集中度` inside the market-temperature card.
- Fund evidence cards use opaque semantic panel surfaces instead of the
  translucent gradient treatment; metric and date are separated so the
  date no longer wraps.
- The three highlighted surfaces preserve the design system's intentionally
  different backgrounds: primary-soft gradient for the benchmark,
  surface/panel mix for temperature stats, and an amber wash over a separate
  surface mix for growth/breadth.
- The benchmark row is inset and rounded to the designed `13px` radius; the
  six-index grid uses the same rounded enclosure.
- The benchmark gradient is softened to a 6% primary wash with a 3%
  midpoint at 42%, then fades into the panel at 88%.
- The repeated `主力资金极值与涨停行业集中度` block was removed.
- Desktop main-index and market-temperature cards are both `940px`.
- Mobile main-index height is `1430px`, equal in quote and relative modes.
- Light/dark desktop and light mobile production screenshots are stored in
  `docs/design/prototypes/explorations/screenshots/market-center-main-indices-v1/style-refinement/`.
- Web tests: `92/92`; web type check passed; web production build passed;
  lint remained at `0` errors with the existing repository warnings.
- Browser checks reported `scrollWidth=1440` and `scrollWidth=390`, with no
  horizontal overflow or console errors.

## Boards Pagination and Visual Alignment

Implemented on 2026-11-24:

- Industry and concept rankings use client-side pagination at 10 rows per
  page.
- Industry and concept rotation tables use the same 10-row pagination.
- Board-detail constituents use the same pager at 10 stocks per page.
- The pager exposes range, previous/next controls, first/last pages and local
  neighboring pages; page and filter changes keep focus deterministic.
- Production checks exercised `1–10 / 496` industry ranking, `1–10 / 496`
  industry rotation, and `1–10 / 188` semiconductor constituents, including
  next-page transitions.
- Concept ranking and rotation were checked at `1–10 / 554` and `1–10 / 549`.
- An intermediate compact-grid iteration displayed all 200 loaded rows. It
  was later replaced by the current market-cap treemap.
- Rotation now uses four full-width quadrant rows on the left and a right
  compact table with all five columns visible. The four rows fill the table
  content height, and each quadrant shows the first three available boards in
  current rank order with relative return, rank, rank change and fund
  confirmation.
- Quadrant board entries use a transparent default background. Hover and
  keyboard focus still resolve to the semantic panel background.
- Ranking rows are ordered by current change percent, so the first page can
  contain only rising boards. Rotation instead ranks a 5/20/60-day
  relative-return window, so falling or lagging boards can appear in its
  quadrants and paginated table.
- Web tests: `98/98`; type check and production build passed; lint remained
  at `0` errors with the existing repository warnings.
- Production desktop and mobile checks found four full-width quadrant rows
  with twelve entries (three per row), no clipping, no console errors and mobile
  `scrollWidth=390`.
- At `1440×900`, both rotation columns measured `536.3px` high and shared the
  same bottom edge as the right table plus pagination. The first quadrant
  button computed to `rgba(0, 0, 0, 0)` by default.
- Concept rotation was also checked at `1440×900` and `1920×1080`. Its four
  desktop quadrant cards now use `auto-rows-fr` within the right-column
  height, so the cards fill the available area instead of leaving space below
  the fourth row.
- The legacy ECharts heatmap selected the top 200 boards by daily ranking,
  then laid out the selected tiles by total market cap descending with area
  proportional to market cap. This established the market-cap sizing model
  later quantized into the current aligned grid.
- The board heatmap now uses a tested market-cap bento grid: it selects the 20
  largest unique boards across the full board list, deduplicates exact
  cap/change duplicates, and maps rank to `2×2`, `2×1`, `1×2` and `1×1`
  spans.
- Desktop uses four columns and seven equal-height rows; mobile uses three
  columns. All tile edges snap to shared row and column tracks.
- Tile colors use one-percent discrete green-gray-red ranges:
  `≤-3%`, `-3–-2%`, `-2–-1%`, `-1–0%`, `0%`, `0–1%`, `1–2%`, `2–3%`, `≥3%`.
- `≥3%` uses solid deep red and `≤-3%` uses solid deep green; the other
  non-zero ranges use 75%, 50% and 25% semantic color mixes instead of
  continuous interpolation. `0%` remains gray.
- The legend pairs each color with neutral range text using a small colored
  dot, so the legend itself does not read as a row of colored buttons.
- Browser verification at `1440×900` and a `390×844` mobile viewport shows the
  nine ranges in numeric order across a two-row five-column legend without
  clipping. The nine computed dot colors are distinct, with solid deep green
  and red reserved for `≤-3%` and `≥3%`.
- Web tests: `98/98`; type check and production build passed.
- At `1920×1080`, the market-center content expands to the workspace width
  (`1634px` in the current shell) instead of the previous `1480px` cap.
- Production desktop and mobile checks found 20 aligned tiles with no console
  errors and mobile `scrollWidth=390`.
- The 5/20/60-day window selector now appears only in the rotation card
  header. The page-level board filter no longer implies that the heatmap uses
  that window.

## Board Ranking Numeric Order

Fixed on 2026-11-24:

- `board.rank` remains text for provider compatibility, but all board readers
  now cast it to integer before ordering.
- The same ordering helper is applied to the public board list, history top
  query, heatmap query and Agent board tool.
- A query-builder test verifies the generated SQL uses
  `cast("board"."rank" as integer) asc`.
- Full Server tests with the local PostgreSQL instance: `269` total, `219`
  passed, `50` opt-in database/admin tests skipped, `0` failed.
- Production API now returns numeric rank order. First page starts
  `1 钴 +11.50%, 2 其他数字媒体 +7.12%, 3 文化用品 +6.17%`.
- Production page 50 renders `491–496 / 496` and all six visible rows are
  falling: `玻璃制造 -2.55%`, `稀土 -2.82%`, `燃料电池 -3.52%`,
  `黄金 -4.11%`, `贵金属 -4.31%`, `白银 -4.95%`.
