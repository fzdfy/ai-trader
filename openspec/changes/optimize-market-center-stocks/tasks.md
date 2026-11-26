# Tasks

## 0. Visual Design Gate

- [x] 0.1 Create the exploration prototype at `docs/design/prototypes/explorations/quant-workbench-market-center-stocks-v1.html` from the confirmed baseline; verify the original prototype is unchanged.
- [x] 0.2 Capture desktop `1440×900`, mobile `390×844`, light and dark screenshots for list pagination, search, watchlist, pagination first/last page, quote canvas, fund structure and loading/empty/error/partial states under `docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/`.
- [x] 0.3 Run screenshot QA and fix all reported visual issues; verify no console errors, failed images or horizontal overflow remain.
- [x] 0.4 Obtain explicit user confirmation of the visual design; verify the confirmed prototype and screenshot index are linked from `design.md`.

## 1. Server Stock-List Query Contract

- [x] 1.1 Create `apps/server/src/lib/stock-list-query.ts` and tests for required full-market pagination plus optional watchlist legacy/paginated modes; verify `cd apps/server && node --import @oxc-node/core/register --test src/lib/stock-list-query.test.ts` passes and covers invalid/partial pairs.
- [x] 1.2 Apply full-market query validation and `instrument.symbol ASC` ordering in `apps/server/src/api/instruments.ts`; verify the query SQL test proves ordering before `limit/offset` and focused server tests pass.
- [x] 1.3 Add a regression test proving analysis search remains correctly filtered after the global `symbol ASC` change; verify the focused server test passes.

## 2. Secure Watchlist API

- [x] 2.1 Refactor `apps/server/src/api/watchlist.ts` to `createWatchlistRoute()` with a Better Auth Session resolver; verify unauthenticated `GET/POST/DELETE` return `401`.
- [x] 2.2 Implement watchlist legacy arrays, paginated responses, search, owner filtering and `symbol ASC`; verify partial `page/limit`, invalid parameters and matched totals with database contract tests.
- [x] 2.3 Add the forged `X-User-Id` security regression and account isolation test; verify the header cannot change read/add/delete ownership.
- [x] 2.4 Preserve `watchlistRoute` mounting in `apps/server/src/api/index.ts`; verify existing analysis consumers still use the legacy response and server tests pass with `ADMIN_DB_TESTS=1`.

## 3. Frontend URL and Query State

- [x] 3.1 Create `apps/web/src/lib/stock-list-state.ts` and tests for `tab/page/q`, page normalization, ranges and detail return context; verify the focused web test passes.
- [x] 3.2 Add `useInstrumentPageQuery` and `useWatchlistInstrumentPageQuery` while keeping existing infinite/legacy hooks for analysis; verify `pnpm --filter @ai-trader/web check-types` passes.
- [x] 3.3 Scope watchlist cache keys by `userId`, disable queries before Session readiness, remove `X-User-Id` headers and invalidate both watchlist prefixes after add/delete; verify account-switch/cache tests and web type checks pass.

## 4. Paginated Stock List UI

- [x] 4.1 Replace “加载更多” with Preline `Pagination` in `apps/web/src/routes/home/market/stock/index.tsx`; verify page 1, middle and last page render 10/remaining rows with correct ranges and disabled boundary actions.
- [x] 4.2 Wire the compact search control to URL `q`, preserve `q` across Tab changes and reset `page=1`; verify matching and no-result search behavior.
- [x] 4.3 Preserve `tab/page/q` through Quick Quote Detail navigation and return; verify browser back/forward, refresh and explicit return all restore the originating list state.
- [x] 4.4 Verify desktop/mobile list layouts have no horizontal overflow, obscured pagination or missing keyboard focus.

## 5. Fixed White Quote Canvas

- [x] 5.1 Add quote-canvas semantic tokens and `quote-canvas-theme.ts` tests for grid, axes, crosshair, tooltip, candle, volume and MACD colors; verify the focused web test passes.
- [x] 5.2 Apply the white chart styles to `klinecharts` and add the `quoteCanvas` tone to `FundStructure` without changing its default board-detail appearance; verify type checks and existing fund-structure usage.
- [x] 5.3 Reorder Quick Quote Detail to summary → K-line → fund structure inside the white data canvas; verify desktop/mobile and light/dark screenshots show one continuous white data surface while navigation/actions follow the theme.
- [x] 5.4 Verify absent fund data remains a white-canvas empty/error state and K-line/summary continue to render.

## 6. K-Line States and Final Verification

- [x] 6.1 Create `kline-status.ts`, tests and `KlineStatusOverlay.tsx`; verify loading, ready, empty and error cannot be misclassified.
- [x] 6.2 Wire chart loading/error/empty states and retry through query invalidation plus `chart.resetData()`; verify loading, empty, error and retry inside the white canvas on desktop and mobile.
- [x] 6.3 Run full verification: `pnpm --filter @ai-trader/server test`, opt-in `ADMIN_DB_TESTS=1 pnpm --filter @ai-trader/server test`, `pnpm --filter @ai-trader/web test`, `pnpm check-types`, `pnpm lint`, `docker compose build nginx`, `pnpm exec openspec validate optimize-market-center-stocks --strict`, and `git diff --check`.
- [x] 6.4 Run production browser acceptance for full-market, search, watchlist, pagination, detail return and white-canvas states at desktop/mobile and light/dark; verify no console errors, failed images, horizontal overflow, obscured controls or contrast warnings.
- [x] 6.5 Write `openspec/changes/optimize-market-center-stocks/verification.md` with exact commands, counts, screenshots, skipped checks and remaining limitations; verify it matches the latest full run.

## Workflow follow-up

- Request user acceptance after the test report is complete.
- Archive only after separate user confirmation.

## 7. Confirmed Stock Refinement

- [x] 7.1 Match the confirmed compact search shell by using one gray-blue surface and removing native input borders.
- [x] 7.2 Change full-market and watchlist pagination to 10 rows and update range tests.
- [x] 7.3 Keep only name/code/price above the K-line and remove the duplicate turnover/fund-flow/PE tiles.
- [x] 7.4 Trust arbitrary localhost, `127.0.0.1` and `[::1]` ports in Better Auth and CORS while rejecting LAN/lookalike origins.
- [x] 7.5 Merge the quote header, K-line and fund structure into one continuous card and remove the implementation-explainer line under the chart title.
- [x] 7.6 Replace the two-line repeated title with one bold stock-name + code line; disable the chart tooltip and move OHLC/MA into a separate information strip above the plot.
- [x] 7.7 Place price/change beside the stock identity with red-up/green-down color and synchronize the OHLC/MA strip with the crosshair date.
- [x] 7.8 Show amount, PE, PE-TTM and PB below the identity, and include per-date amount in the crosshair information strip.
