# Verification

## Date

2026-11-22

## Verdict

- `tasks.md` `4.1` is complete using real Docker PostgreSQL, real quant data and the current worktree React page.
- User acceptance was confirmed on 2026-11-22.
- Native code review completed and its verified correctness fixes are included below.
- Archive still requires a separate confirmation; one unresolved product-scope decision is listed under Known Gaps.

## Environment

- Docker Compose project: `/Users/dakai/Documents/study/ai/ai-trader`
- Docker binary: `/Users/dakai/.docker/bin/docker`
- PostgreSQL container: `aitrader-postgres`, host port `5532`
- Current quant: `127.0.0.1:3002`
- Current server: `127.0.0.1:3001`
- Current Vite page: `http://localhost:9080`
- Feature flags during integration: `DASHBOARD_MARKET_RADAR_ENABLED=true`, `MARKET_ASSET_INGEST_ENABLED=true`

The earlier “no Docker/PostgreSQL” blocker was caused by Docker socket access and a missing Node PATH, not by the project environment.

## Database Migration

- Applied `apps/server/migrations/0040_parallel_whistler.sql` with `pnpm --dir apps/server db:migrate`.
- Drizzle reported `migrations applied successfully`.
- Confirmed tables:
  - `market_asset_quote`
  - `market_asset_minute_bar`
  - `market_asset_daily_bar`
- Confirmed unique and query indexes:
  - `market_asset_quote_symbol_pk`
  - `market_asset_minute_bar_symbol_bucket_start_pk`
  - `market_asset_daily_bar_symbol_trade_date_pk`
  - `market_asset_minute_symbol_bucket_idx`
  - `market_asset_minute_session_idx`
  - `market_asset_daily_symbol_date_idx`

## Real Ingestion

Real upstream requests were used; no market response was mocked. Because the verification day was Saturday, the minute job was invoked with the latest A-share session clock to exercise the same production adapter and real upstream endpoints.

| Table | Rows |
|---|---:|
| `market_asset_quote` | 7 |
| `market_asset_minute_bar` | 2,660 |
| `market_asset_daily_bar` | 8,000 |

Coverage:

| Asset | Minute rows | Minute session | Daily rows | Daily range |
|---|---:|---|---:|---|
| `000001.SH` | 242 | 2026-11-20 | 600 | 2024-06-03 → 2026-11-20 |
| `399006.SZ` | 242 | 2026-11-20 | 600 | 2024-06-03 → 2026-11-20 |
| `510300.SH` | 267 | 2026-11-20 | 600 | 2024-06-03 → 2026-11-20 |
| `588000.SH` | 267 | 2026-11-20 | 600 | 2024-06-03 → 2026-11-20 |
| `159992.SZ` | 267 | 2026-11-20 | 600 | 2024-06-03 → 2026-11-20 |
| `XAUUSD` | 1,375 | 2026-11-20 | 5,000 | 2007-08-08 → 2026-11-20 |
| `IXIC` | none | — | none | Yahoo returned upstream `HTTP 429` |

Latest Tencent quote times observed:

- A-share assets: `2026-11-20` around `08:14Z`.
- `XAUUSD`: `2026-11-20T21:55:00.000Z`.
- `IXIC`: `2026-11-20T09:15:59.000Z`.

The missing IXIC history is explicit and does not block the other assets. Its quote remains available and the Market Brief returns a partial-success response.

## Integration Defects Fixed

- Weekend `1D` charts now query the latest seven calendar days from storage and filter to the last complete `sessionDate`, instead of starting at the current weekend midnight and returning an empty chart.
- Market-asset time-series providers are fixed by asset through the registry: A-share → Tencent, XAU → Sina, IXIC → Yahoo. Providers that explicitly reject an asset are no longer attempted as generic fallbacks.
- Tencent market-asset daily requests are clamped to its supported `600`-row page size. A `5000` request previously returned `data: []` and caused an `AttributeError`.

All three fixes were implemented RED→GREEN with focused tests.

## Market Brief API

Default real response:

`GET /api/v1/dashboard/market-brief?symbol=000001.SH&range=1D&etfSymbol=510300.SH&etfRange=5D&globalSymbol=XAUUSD&globalRange=YTD`

- HTTP `200`.
- `aShareSession.phase = non_trading_day`.
- Seven tickers returned.
- A-share `1D`: 242 points, session `2026-11-20`, quality `available`.
- ETF `5D`: 5 points, session `2026-11-20`, quality `available`.
- XAU `YTD`: 230 points, session `2026-11-20`, quality `available`.
- SIGNAL: quality `available`, stance `neutral`.

Independent ETF ranges:

- `588000.SH / YTD`: 213 points.
- `159992.SZ / 1M`: 22 points.
- Changing ETF selection/ranges did not alter the A-share chart, XAU chart or SIGNAL.

Partial missing response:

- `globalSymbol=IXIC&globalRange=5D` returns HTTP `200`.
- Global chart quality is `missing`, points are `0`, reason is `no valid bars`.
- ETF and A-share charts remain available.

## Real Browser

The current React page was exercised against the current server, Docker database and real market assets.

Evidence:

- `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/production-live/light-desktop/`
- `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/production-live/dark-desktop/`
- `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/production-live/light-mobile/`
- `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/production-live/dark-mobile/`
- `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/production-live/interactions/`
- `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/production-live/browser-check/`

Measurements at desktop `1440×900`:

- Left A-share board: top `195.89px`, bottom `971.39px`, height `775.5px`.
- Right context stack: top `195.89px`, bottom `971.39px`, height `775.5px`.
- Bottom delta: `0px`.
- Grid columns: `785.688px 356.297px`.

Measurements at mobile `390×844`:

- Grid columns: `358px` (single column).
- Document width: `390px`; viewport width: `390px`.
- No horizontal overflow.

Interactions:

- ETF `ArrowRight` moved selection from 沪深300ETF to 科创50ETF, changed the ETF chart to `588000.SH`, retained focus on the ETF tablist and exposed `aria-activedescendant="etf-tab-588000.SH"`.
- A focused price chart accepted `ArrowLeft` and exposed the selected data point through its live region.
- IXIC missing selection rendered “历史行情不足 / no valid bars” while A-share and ETF remained visible.
- Today Execution contains exactly two sibling cards: “今日行动” and “今日工作流”.
- Today Actions showed the Work Task empty state; Today Workflows showed the Workflow Run empty state.
- Light/dark desktop and mobile screenshots had no console errors, horizontal overflow or failed images.

## Code Review Fixes

- SIGNAL trend now reads a separate daily history series. It remains identical when the user changes the A-share chart between `1D` and `YTD`, instead of accidentally calculating a 20-minute MA for `1D`.
- Data confidence uses four explicit inputs: selected quote, all A-share quotes, daily trend coverage and breadth/heat completeness. Stale or missing inputs lower quality as defined by the design.
- Stored bars with fewer than two points or a latest bucket older than four days are returned as `low` with a stale reason.
- Weekday exchange holidays now return `non_trading_day` using `trading_calendar`; weekday alone is no longer treated as proof that the market is open.
- Explicit provider selection now returns HTTP `400` when the provider does not support the asset, rather than leaking a provider `ValueError` as HTTP `500`.
- Today Work Task rows navigate to `/home/tasks?task=<id>`, and Workflow Run timestamps use the user timezone.
- ETF and price-chart keyboard paths were verified in the real browser. Market Brief retains previous data while the next ETF request is in flight, so the focused tablist is not unmounted during normal keyboard navigation.
- Today actions, today workflows and the Market Radar aggregate now expose focused retry actions for their recoverable error states.
- The A-share signal input caption follows the selected index instead of always claiming “上证趋势”.
- The user confirmed removal of the unimplemented “追问 AI” context entry; the OpenSpec scenario and long-term technical design no longer promise that control.

## Automated Checks

| Check | Result | Evidence |
|---|---|---|
| Quant full suite | PASS | `cd apps/quant && .venv/bin/python -m unittest discover -s tests -v` → 47 tests passed |
| Server full suite | PASS | `cd apps/server && DATABASE_URL=... pnpm test` → 240 tests, 190 passed, 0 failed, 50 skipped by explicit DB-test flags |
| Server type check | PASS | `cd apps/server && pnpm check-types` |
| Server lint | PASS with existing warnings | `oxlint .` → 0 errors |
| Web full suite | PASS | `cd apps/web && pnpm test` → 74 tests passed |
| Web type check | PASS | `cd apps/web && pnpm check-types` |
| Web lint | PASS with existing warnings | `oxlint .` → 0 errors, 6 pre-existing warnings |
| Web production build | PASS | Vite build completed; existing chunk-size warnings remain |
| OpenSpec strict validation | PASS | `pnpm exec openspec validate add-dashboard-market-radar --strict` |

## Visual Review Notes

- Desktop and mobile layouts were visually inspected from the generated screenshots.
- The desktop right stack is independently composed but exactly matches the left board height and bottom edge.
- The production UI still reports pre-existing density/accessibility lint: 59 text nodes below `11px`, plus 3-7 low-contrast notices depending on mode. The affected labels are concentrated in the existing workbench chrome and dense market data UI.
- These warnings do not change the confirmed module placement, ETF tab interaction or height alignment, but should be handled as a separate accessibility polish task before claiming an app-wide accessibility pass.

## Known Gaps

- IXIC minute/daily ingestion is currently blocked by Yahoo upstream `HTTP 429`; fixture parsing and the UI missing state are verified.
- The 50 skipped server tests require explicit `ADMIN_DB_TESTS=1` / `WORKFLOW_DB_TESTS=1` database fixtures and are outside this change-specific run.
- Feature flags remain default-off; integration used explicit `true` overrides.

## Acceptance

Task `4.1` is complete and the user accepted the implementation. The code-review fix pass and the user-approved scope cleanup are verified above. The change is not archived and still requires a separate archive confirmation.
