# SDD ledger — plan: docs/superpowers/plans/2026-11-25-optimize-market-center-stocks.md

Pre-flight: current `codex/dashboard-market-radar` worktree contains the prerequisite market-center work and unrelated uncommitted changes. Ruling: execute inline in this worktree without per-task commits so unrelated user changes are not staged; verification evidence and tasks.md are the ledger — cost: final commit grouping is manual.

Task 1: complete (working tree, tests: `node --import @oxc-node/core/register --test src/lib/stock-list-query.test.ts` → 7/7 pass, `pnpm --filter @ai-trader/server check-types` → pass)
Task 1: Ruling: full-market omitted pagination defaults to page 1 / limit 50; watchlist omission retains legacy response — required for compatibility — cost if wrong: one default page-size adjustment.

Task 2: complete (working tree, no-DB tests: `node --import @oxc-node/core/register --test src/api/watchlist.test.ts` → 2 pass / 1 opt-in skip; DB tests: `ADMIN_DB_TESTS=1 node --env-file-if-exists=../../.env.local --import @oxc-node/core/register --test src/api/watchlist.test.ts` → 3/3 pass; server type check → pass)
Task 2: Ruling: watchlist keeps `/instruments` and switches response shape only when both `page` and `limit` are supplied — preserves the analysis consumer without a new endpoint — cost if wrong: a future caller may need an explicit mode discriminator.

Task 3: complete (working tree, `node --test --experimental-strip-types src/lib/stock-list-state.test.ts` → 5/5 pass; `pnpm --filter @ai-trader/web check-types` → pass)
Task 3: Ruling: existing infinite instrument/watchlist hooks remain intact for analysis consumers; market stock page gets separate page hooks — avoids a broad hook contract change — cost if wrong: minor hook duplication.

Task 4: complete (working tree, focused stock-list state 5/5 pass, web type check pass, browser verified 1–20 / 21–40 / 5561–5579, search, watchlist, keyboard, refresh, back/forward and detail return context)
Task 4: Ruling: detail context fields are `listTab/listPage/listQ` — they round-trip cleanly through typed route search and leave legacy `list` consumers untouched — cost if wrong: a future market list source needs another context adapter.

Task 5: complete (working tree, quote canvas contract 1/1 pass, web type check pass, production screenshots in `market-center-stocks-v1/production/`)
Task 5: Ruling: the installed klinecharts style type exposes tooltip color through title/rect rather than the plan's illustrative `tooltip.text` — mapped the supported title, rect, axes, crosshair, candle, indicator and separator fields — cost if wrong: future klinecharts versions may add extra tooltip text tokens.

Task 6: complete (working tree, K-line status/timeout 5/5 pass, web 109/109, server 228 pass / 0 fail / 51 skip with project env, opt-in DB 278 pass / 0 fail / 1 skip, types 2/2, lint 0 errors, nginx build/deploy and strict OpenSpec pass)
Task 6: Ruling: K-line requests abort after 15 seconds so a hung upstream proxy can surface the explicit error state — required because the normal proxy timeout is 300 seconds — cost if wrong: a genuinely slow request over 15 seconds is reported as failed and can be retried.
Task 6: Ruling: the server package script does not load `.env.local`, so verification uses the same test runner with `--env-file-if-exists=../../.env.local`; both stock-analysis failures under the raw script were missing DB configuration, not assertion regressions — cost if wrong: the report's command differs from the package script alias.
Task 6: Ruling: production screenshots are CUA JPEG captures saved with `.jpg` suffixes; re-encoding to PNG only to match an arbitrary extension was unnecessary — cost if wrong: evidence filenames differ from the prototype's PNG naming convention.

Final: self-review (no subagent dispatch under the current no-proactive-delegation constraint)
Final: minor (deferred): the stock page mounts both full-market and watchlist page queries; the inactive scope is still enabled when Session exists — accepted because correctness is intact and avoiding one extra bounded request would require a hook-contract change after the completion gate.

Task 7: complete (working tree, focused stock-list 5/5, auth/CORS 10/10, web 109/109, server 230 passed / 0 failed / 51 skipped, opt-in DB 280 passed / 0 failed / 1 skipped, types 2/2, lint 0 errors, nginx build/deploy, Vite login at 127.0.0.1:9081 and localhost:9081, production page ranges 1–10 / 11–20 / 5571–5579)
Task 7: Ruling: localhost trust is implemented as three fixed HTTP loopback patterns (`localhost`, `127.0.0.1`, `[::1]`) shared by Better Auth and CORS — this supports arbitrary Vite ports without trusting LAN, public domains or lookalike hosts — cost if wrong: HTTPS loopback development origins require an explicit additional pattern.
Task 7: Ruling: the confirmed detail card combines the themed quote header with the white chart/fund region inside one outer border, while the chart region keeps its fixed white background — this preserves dark-theme page chrome and merges the visual block — cost if wrong: the header and chart backgrounds intentionally differ inside the same card.
Task 7.6: complete (working tree, K-line summary 2/2, quote canvas style 1/1, web 111/111, production detail verified with one stock identity and no chart/indicator legend over the candles)
Task 7.6: Ruling: OHLC/MA values are rendered by React in a dedicated strip above the chart and both candle and indicator tooltips are disabled — this guarantees no text overlap at idle or hover — cost if wrong: crosshair-specific historical tooltip values are no longer interactive.

Final refinement review: self-review completed after the merged-card, one-line identity, separated OHLC/MA strip, 10-row pagination and loopback-origin changes; no new critical or important findings. The earlier inactive-scope query note remains the only deferred minor.
