# Market Center Stocks Refinement

Exploration for `optimize-market-center-stocks`.

Prototype:

`docs/design/prototypes/explorations/quant-workbench-market-center-stocks-v1.html`

## Direction

Keep the confirmed Apollo Quant workbench, table-first market hierarchy, and A-share red-up/green-down semantics. Improve browsing control without adding another page shell.

Key decisions:

- The stock search box is one compact control: icon and input plus an inset blue action.
- Pagination uses the existing quiet pagination language rather than a second toolbar.
- The mobile pagination controls stay left-aligned so the fixed assistant button cannot cover the next-page action.
- Quick Quote Detail keeps its themed page chrome but places all K-line panes and capital structure inside one fixed white data canvas.
- The chart uses white-canvas-specific grid, axis, candle, volume, MACD, fund and error-state colors in both light and dark themes.

## Screenshots

- `stocks-light/`: stock list search row and first page, desktop and mobile.
- `stocks-light-list/`: expanded stock table and pagination card.
- `stocks-dark/`, `stocks-dark-list/`: dark-theme stock list.
- `search-result-light/`, `search-empty-light/`: matching and empty search results.
- `watchlist-light/`: watchlist pagination state.
- `pagination-light/`, `pagination-light-mobile/`: first-page pagination.
- `pagination-page2/`: last page, range and disabled next state.
- `detail-light/`, `detail-dark/`: quick quote detail with fixed white K-line canvas.
- `funds-light/`, `funds-dark/`: capital structure inside the same white canvas.
- `states/`: loading, empty, error and partial-success states, desktop and mobile.

The prototype uses deterministic sample market data. It does not call production APIs.

## Production Acceptance

Real-browser acceptance captures from the deployed local build are indexed in
[`production/README.md`](./production/README.md). They cover the stock list,
search, watchlist, pagination, detail return context, and fixed white quote
canvas in light/dark and desktop/mobile layouts.

## Visual QA

- Screenshot tooling reported no console errors, page-level horizontal overflow or failed images for the current light, dark, desktop, mobile, pagination and state captures.
- Search action, sort/page hint and pagination text were increased to 11px.
- The fixed white canvas removed nested card outlines from capital-structure tiles and uses stronger text red/green for readable contrast.
- Mobile pagination controls are left-aligned so the fixed assistant button does not cover the next-page action.
- Independent visual review was unavailable because the reviewer sub-agent repeatedly returned only its onboarding acknowledgement. Per `oil-ui` fallback, visual review was completed by the main agent against the real screenshots.
