# Verification

Date: 2026-11-25
Branch: `codex/dashboard-market-radar`

## Automated Checks

| Check | Command | Result |
|---|---|---|
| Server, non-DB suite with project env | `cd apps/server && node --env-file-if-exists=../../.env.local --import @oxc-node/core/register --test "src/**/*.test.ts"` | 281 tests, 230 passed, 0 failed, 51 opt-in skipped |
| Server, opt-in DB suite | `cd apps/server && ADMIN_DB_TESTS=1 node --env-file-if-exists=../../.env.local --import @oxc-node/core/register --test "src/**/*.test.ts"` | 281 tests, 280 passed, 0 failed, 1 workflow DB skip |
| Web | `pnpm --filter @ai-trader/web test` | 111 passed, 0 failed |
| Types | `pnpm check-types` | 2/2 packages passed |
| Lint | `pnpm lint` | 0 errors; 34 existing warnings in unrelated files |
| Web build | `docker compose build nginx` | image built successfully |
| Deploy | `docker compose up -d --no-deps server nginx` | updated server/nginx containers running |
| OpenSpec | `pnpm exec openspec validate optimize-market-center-stocks --strict` | valid |
| Whitespace | `git diff --check` | passed |

The package-level `pnpm --filter @ai-trader/server test` command does not load
`.env.local`; running it without the project environment caused the two
pre-existing stock-analysis tests to look for PostgreSQL on `5432`. Both pass
with the project's `5532` database loaded through the command above.

## Browser Acceptance

Verified against the deployed build at `http://localhost:9180`.

- Full market: page 1 rendered rows `1–10 / 5579`, page 2 rendered `11–20`,
  and page 558 rendered `5571–5579`; previous/next boundaries were disabled on
  the first/last page.
- Search shell: one continuous gray-blue surface with a borderless input; the
  native nested input border is absent.
- Search: `比亚迪` reset to page 1 and returned one row; `不存在XYZ` returned
  the explicit no-match state with no pagination.
- Watchlist: the Session-authenticated list rendered its owned instruments at
  `1–1 / 1`; the forged identity header regression is covered by the DB suite.
- URL state: refresh, history back/forward, Tab switching and page changes
  restored `tab/page/q`. Detail URLs carried
  `from=market-stock&listTab=...&listPage=...&listQ=...`.
- Keyboard: pressing Enter on a focused stock row opened the detail route and
  preserved all list-context fields.
- Return: the explicit return link restored the originating watchlist/page/query
  state, including the last full-market page.
- Quote detail: the stock name/code/price header, K-line and fund structure share
  one continuous card. Duplicate turnover, main-fund-flow and PE tiles are absent,
  as is the “固定白色数据画布” explainer line. The stock identity is one bold
  name + code line; OHLC/MA values render in a separate strip above the plot,
  while klinecharts title/indicator tooltips are disabled so they cannot cover candles.
- K-line states: loading was visible immediately; stopping the API produced the
  explicit failure state after the 15-second request timeout; retry recovered
  to the empty-data state after the API restarted.
- Mobile: page-level layout had no horizontal overflow. The pagination control
  remains reachable above the fixed assistant button, and chart/fund content
  scrolls without clipping.
- Vite authentication: real login succeeded at both `http://127.0.0.1:9081` and
  `http://localhost:9081`; arbitrary loopback ports are accepted while LAN and
  lookalike origins remain rejected by the focused CORS tests.

Real captures:

- [`production/stock-list-light-desktop-1440x900.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-list-light-desktop-1440x900.jpg)
- [`production/stock-list-light-mobile-top-390x844.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-list-light-mobile-top-390x844.jpg)
- [`production/stock-list-light-mobile-pagination-390x844.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-list-light-mobile-pagination-390x844.jpg)
- [`production/stock-list-dark-desktop-page2-1440x900.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-list-dark-desktop-page2-1440x900.jpg)
- [`production/stock-list-dark-mobile-page2-390x844.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-list-dark-mobile-page2-390x844.jpg)
- [`production/stock-search-result-light-mobile-390x844.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-search-result-light-mobile-390x844.jpg)
- [`production/stock-search-empty-light-mobile-390x844.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-search-empty-light-mobile-390x844.jpg)
- [`production/stock-watchlist-light-mobile-390x844.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-watchlist-light-mobile-390x844.jpg)
- [`production/stock-detail-light-desktop-1440x900.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-detail-light-desktop-1440x900.jpg)
- [`production/stock-detail-dark-desktop-1440x900.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-detail-dark-desktop-1440x900.jpg)
- [`production/stock-detail-light-mobile-funds-390x844.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-detail-light-mobile-funds-390x844.jpg)
- [`production/stock-detail-error-dark-desktop-1440x900.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-detail-error-dark-desktop-1440x900.jpg)
- [`production/stock-detail-error-dark-mobile-390x844.jpg`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/stock-detail-error-dark-mobile-390x844.jpg)
- [`production/README.md`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/production/README.md)
- [`market-center-stocks-v2 production`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v2/production/README.md)
- [`market-center-stocks-v2 detail light`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v2/detail-light/page-1440x900.png)
- [`market-center-stocks-v2 detail dark`](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v2/detail-dark/page-1440x900.png)

## Notes and Limitations

- The API-outage test intentionally stopped the local server to reach the
  failure path. The long-lived test tab recorded one generic `Uncaught` console
  entry during that forced outage; a fresh tab exercising the normal list path
  recorded zero console errors.
- Lint is warning-clean for this change but the repository still reports 34
  existing warnings in unrelated files.
- No database migration or K-line provider/contract change was introduced.
- The change is implemented and verified but not archived; user acceptance and
  a separate archive confirmation are still required.
