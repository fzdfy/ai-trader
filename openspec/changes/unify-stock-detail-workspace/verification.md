# Verification

日期：2026-11-27

## Automated Checks

- Web tests：`node --test --experimental-strip-types 'src/**/*.test.ts'`
  - 131 tests passed, 0 failed.
- Web type check and lint：`../../node_modules/.bin/tsgo -b --noEmit && ../../node_modules/.bin/oxlint .`
  - Exit 0.
  - Lint reported 4 warnings in pre-existing unrelated files
    (`ReviewContent.tsx`, `StrategyForm.tsx`, `backtest.tsx`, `factors/compare.tsx`);
    this change adds no warnings.
- Server type check and lint：`../../node_modules/.bin/tsgo -b --noEmit && ../../node_modules/.bin/oxlint .`
  - Exit 0.
  - Lint reported 19 pre-existing warnings outside this change; no new warning.
- Forecast/domain tests：`node --import @oxc-node/core/register --test src/lib/stock-analysis-data.test.ts`
  - 6 tests passed, including forecast-only response shape and no aggregate fields.
- Production build：`../../node_modules/.bin/vite build`
  - Exit 0.
  - Existing large-chunk advisory remains; research detail is emitted as a separate lazy chunk.
- OpenSpec：`./node_modules/.bin/openspec validate unify-stock-detail-workspace --strict`
  - Valid.

The package-level `pnpm` launcher was unavailable because Corepack could not verify the
registry signature in this environment. The repository-local executables above were used
instead; this does not change the commands' pass/fail criteria.

## Browser Regression

All implementation evidence is indexed in
`docs/design/prototypes/explorations/screenshots/unified-stock-workspace-v2/README.md`.

- Quick mode, light, `1440×900` and `390×844`: passed without console errors, failed images
  or horizontal overflow.
- Research mode, light, desktop and mobile: passed with the same checks.
- Research loading: quote context, shared header and navigation remained visible.
- Research error: stable error appeared without clearing quote/K-line context; return to quick
  remained available.
- Research partial success: one missing news module did not clear other research modules.
- Signal matrix: desktop drawer is 560px; mobile drawer uses full width; one row expands in place.
- Mode switch: quick to research completed in place.
- Legacy detail: `/home/market/analysis/002594.SZ` entered the unified research workspace.
- Dark mode: desktop and mobile captured with `dark: true`; neither viewport had horizontal
  overflow.
- Quick request trace: only `/api/v1/stock-analysis/:symbol/forecast` was requested for
  prediction; the full stock-analysis aggregate was absent until research mode.

The browser run used a local read-only mock API because PostgreSQL was not running in this
environment. API route integration coverage remains behind `ADMIN_DB_TESTS=1`; the response
shape and forecast behavior are covered by pure server tests.

## Acceptance Gaps

- No live PostgreSQL-backed response was executed in this environment.
- No automated DOM test suite exists for focus restoration after drawer close; this was covered
  by implementation review and real-browser open/expand interaction.
- The K-line future path is a geometric interpolation from current close to the existing 5D
  P50 terminal value. It is explicitly labelled as endpoint interpolation, not a new daily
  model and not the separate L2 forecast-model work.

## Rollback

- Remove the `forecast` endpoint and the K-line overlay; quick mode falls back to
  “预测待接入”.
- Keep the unified route with `mode=research`, or remove research mode to restore the legacy
  analysis entry while retaining the compatibility redirect.
- No database migration, Quant change or persisted forecast data is involved.
