# Verification

## Date

2026-11-22

## Automated Checks

| Check | Result | Evidence |
|---|---|---|
| Quant full suite | PASS | `cd apps/quant && .venv/bin/python -m unittest discover -s tests -v` → 44 tests passed |
| Server targeted change suite | PASS | 45 tests covering provider contracts, schema, storage, reader, ranges, charts, signal, Market Brief, feature flag, worker jobs, retention and governance registry |
| Server type check | PASS | `cd apps/server && pnpm check-types` |
| Server lint | PASS with existing warnings | `oxlint .` → 0 errors, 18 existing warnings before final cleanup |
| Web full suite | PASS | `cd apps/web && pnpm test` → 71 tests passed |
| Web type check | PASS | `cd apps/web && pnpm check-types` |
| Web production build | PASS | Vite build completed; chunk-size warnings are existing |
| Web lint | PASS with existing warnings | `oxlint .` → 0 errors, 6 unrelated warnings |
| OpenSpec strict validation | PASS | `openspec validate add-dashboard-market-radar --strict` |

## Provider Live Smoke

- Tencent returned all seven fixed-asset quotes.
- Tencent returned A-share minute and daily data.
- Sina returned XAU minute and daily data; XAU minute crossed midnight while retaining one `session_date`.
- Yahoo IXIC parser was verified against the production response shape; live requests were temporarily throttled with `HTTP 429`.

## Production React Page

- Production components were exercised against a temporary mock API only.
- Desktop `1440×900`: left A-share board and right context stack both measured `775.5px`; bottom delta `0px`.
- Light/dark desktop and mobile screenshots completed with no console errors, image failures or horizontal overflow.
- ETF keyboard Tab switching changed only the ETF domain.
- Work Task and Workflow Run rendered in separate columns; no request payload mixing.
- Evidence: `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/production-mock/`.

## Database Migration

- Generated additive migration: `apps/server/migrations/0040_parallel_whistler.sql`.
- Second `drizzle-kit generate` run reported `No schema changes`.
- Migration creates only:
  - `market_asset_quote`
  - `market_asset_minute_bar`
  - `market_asset_daily_bar`
- Migration was not applied because no PostgreSQL server was available.

## Full Server Suite Blocker

Fresh full server result:

- 232 tests
- 180 passed
- 2 failed
- 50 skipped

Both failures are in pre-existing stock-analysis tests that require PostgreSQL; the environment returns `EPERM` when connecting to `127.0.0.1:5432`/`5532`. The 45 tests directly covering this change all pass.

## Review Fixes

- Market Brief now degrades to a missing/neutral SIGNAL when breadth/heat snapshot loading fails instead of returning HTTP 500.
- Daily range filtering now uses the asset-local date, preventing Shanghai YTD queries from including the previous UTC date.
- ECharts subtitle/theme token changes now trigger option refresh when light/dark mode changes.
- Market asset tables are registered in the governance catalog with retention and job lineage.

## Not Verified

- Real collection → `market_asset_*` ingestion → Market Brief → browser with PostgreSQL.
- Applying migration `0040` to a real database and inspecting the resulting indexes/PKs.
- Yahoo IXIC live request after upstream 429 clears.

## Acceptance

Implementation and mock-browser verification are complete for all code tasks. User acceptance is still required. The change must not be archived while task `4.1` remains blocked.
