# Unified Stock Workspace V2 Visual Evidence

## Scope

- User task: one stock identity with two progressive depths, defaulting to quick
  market inspection and loading research only when requested.
- Primary viewport: `1440×900`; responsive check: `390×844`.
- Visual baseline: the updated
  [`Current Design Atlas`](../../atlas/index.html), specifically the latest
  quick quote detail and stock analysis entries.
- Exploration:
  [`unified-stock-workspace-v2.html`](../../unified-stock-workspace-v2.html).
- The previous
  [`unified-stock-workspace-v1.html`](../../unified-stock-workspace-v1.html)
  remains unchanged for comparison.

## Visual Decisions

- The latest Atlas stock-analysis grammar is the base: flat stock identity header,
  bold name/code and quote, action row, and compact data-status cells.
- Quick mode draws the future week directly into the K-line data canvas, followed
  by a numeric forecast summary.
- The future-week chart contains exactly one P50 median path. The shaded P10/P90
  interval communicates uncertainty; no multi-path scenarios are drawn.
- Research mode keeps a compact “行情底稿”, 44-item technical evidence, one
  forecast path, risk ranges, financials and events.
- Each technical-signal matrix opens a right-side drawer with every item in that
  group. Collapsed cards show the first three items in stable catalog order and
  label them as a three-item preview, not as a live priority ranking.
- Inside the drawer, any signal item expands in place to reveal evidence, data
  boundaries, version/time, rule parameters, confirmation and invalidation.
- Expanded evidence uses a full-width, square-edged subtle surface across the
  entire drawer width rather than an inset rounded card.
- Research loading, failure and partial-success states stay inside the research
  region and never clear the shared quote, market context or navigation.
- Mobile keeps the latest analysis order: identity and quote, actions, data status,
  mode switch, then market/research content.

## Evidence

- `light/`: six states at desktop and mobile in light mode.
- `dark/`: six states at desktop and mobile in dark mode.
- `kline-forecast/light/`, `kline-forecast/dark/`: the K-line canvas with one
  future-week P50 path.
- `research-forecast/light/`, `research-forecast/dark/`: research-mode future-week
  module showing one path and risk summaries.
- `signal-groups/light/`, `signal-groups/dark/`: clickable matrix-card states.
- `signal-drawer/click-light/`, `signal-drawer/click-dark/`: real pointer clicks
  opening the full matrix drawer.
- `signal-drawer/hover-light/`, `signal-drawer/hover-dark/`: full-width,
  square-edged row hover states with a lighter background.
- `interactions/`: switch to research and return to quick in place.
- `keyboard-desktop/`, `keyboard-mobile/`: keyboard focus on the research mode.

## States

- `quick`
- `research`
- `loading`
- `error`
- `partial`
- `market-missing`

## Limitations

- Quotes, funds, forecasts, financials and events are representative interface
  data, not live API output.
- Spring implementation timing, real query caching, production history navigation
  and runtime `prefers-reduced-motion` remain implementation checks.
- This exploration is not part of the current Atlas until the user confirms it and
  the implementation is accepted.

## Review

- Initial visual review: **8/10**. It required a first-screen single-path entry,
  an explicit current-close anchor, a compact mobile market sparkline, complete
  mobile failure actions, and removal of duplicate recovery actions.
- UX walkthrough: mode switching and rollback worked; mobile failure recovery and
  the lost mobile market sparkline were corrected.
- Final closure review: **9/10**, no remaining blockers; ready for user visual
  confirmation.
- The forecast contains one P50 median path and a P10/P90 uncertainty band only.
- The three visible signals in each matrix are a fixed catalog-order preview, not a
  dynamic “top three”; the entire group is available in the drawer.
- The shared stock identity appears once; research failure keeps quote, market
  context and navigation available.
- All 50 final screenshots report zero console errors, failed images, page-level
  horizontal overflow and `oil-ui` lint findings.
- The remaining production-only checks are normal-speed motion and the runtime
  `prefers-reduced-motion` path.

User visual confirmation: **confirmed on 2026-11-27**.

## Implementation Evidence

- `implementation/quick-final/`: final light quick mode at desktop and mobile.
- `implementation/research-final-page/`: final light research mode at desktop and mobile.
- `implementation/research-loading/`: research loading while quote context and navigation stay visible.
- `implementation/research-error-final/`: stable research error with quick return preserved.
- `implementation/research-final/signal-drawer-expanded-*.png`: 560px/mobile-full-width
  signal drawer with one expanded evidence row.
- `implementation/mode-switch/`: in-place quick-to-research switch.
- `implementation/legacy-redirect/`: legacy analysis detail entering the unified workspace.
- `implementation/dark-final/`: real dark-mode desktop and mobile screenshots; both report
  `dark: true` and no horizontal overflow.
- Quick-mode browser request trace loads only `/stock-analysis/:symbol/forecast` for prediction
  and does not request the full stock-analysis aggregate.
