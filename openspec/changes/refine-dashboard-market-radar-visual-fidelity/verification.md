# Dashboard Market Radar Visual Fidelity Verification

Date: 2026-11-22

## Scope

Verified the `/home` dashboard content against:

- `docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v6.html`
- `openspec/changes/refine-dashboard-market-radar-visual-fidelity/specs/preline-workbench-ui/spec.md`
- Real data from the running Docker PostgreSQL instance and the Market Brief API

The Apollo Quant shell, sidebar, authentication, routes, task links, workflow links, DB schema, and feature-flag rollback remain unchanged.

## Automated Checks

| Check | Command | Result |
|---|---|---|
| Web tests | `cd apps/web && pnpm test` | 83 passed, 0 failed |
| Web types | `cd apps/web && pnpm check-types` | Passed |
| Web lint | `cd apps/web && pnpm lint` | 0 errors; 6 pre-existing warnings |
| Web production build | `cd apps/web && pnpm build` | Passed; 5113 modules transformed |
| Server tests | `cd apps/server && pnpm exec dotenvx run -f ../../.env.local -- pnpm test` | 190 passed, 0 failed, 50 DB-gated tests skipped |
| Server types | `cd apps/server && pnpm check-types` | Passed |
| Server lint | `cd apps/server && pnpm lint` | 0 errors; 18 pre-existing warnings |
| OpenSpec validation | `pnpm exec openspec validate refine-dashboard-market-radar-visual-fidelity --strict` | Valid |

The first unconfigured server test run could not connect to PostgreSQL from the sandbox and failed two database-backed tests with `EPERM`; rerunning with the current `.env.local` against Docker PostgreSQL passed.

The Docker `server` and `nginx` images were rebuilt without resetting the PostgreSQL volume. `http://localhost:3101/health` returned HTTP 200 and `http://localhost:9180/` returned HTTP 200 from the rebuilt images.

## Browser Verification

The real authenticated page was exercised at:

- Desktop: `1440×900`
- Wide desktop: `1920×1080`, content capped at `1480px`
- Mobile: `390×844`
- Light and dark modes
- ETF Tab keyboard selection
- A-share chart keyboard data-point navigation
- Loading, request error, partial missing data, and stale data

Measured desktop geometry:

- A-share board and right context stack: both `715.66px` at `1440×900`, same top and bottom
- Today action and Today workflow cards: both `270px`, same top and bottom
- Daily picks and news cards: both `199.84px`, same top and bottom
- Recent review card: `223.59px` full-width row
- Desktop document width: `1440px`; no horizontal overflow
- Mobile document width: `390px`; no horizontal overflow
- Console errors: 0

ETF keyboard navigation selected `科创50ETF / 588000.SH`, updated `aria-activedescendant`, and changed only the ETF chart. A-share chart arrow navigation exposed the live data-point text while preserving focus. The cross-market and ETF selections did not change the A-share SIGNAL. Follow-up source parity reduced the chart to six visible time labels and four value splits, restored the market-quality date, and moved daily picks and news into the same lower grid.

Specific interaction checks:

- Price line: `2.1px`; grid/reference lines: `1px`.
- `1D` labels: time such as `09:30`; `5D/1M`: dates such as `11/20`; `YTD`: month labels such as `11月`.
- Price and volume X axes use the same category positions.
- London gold, Nasdaq, and Nasdaq missing state keep the global card at exactly `358px`.
- A-share SIGNAL uses the v6 blue gradient and the `追问 AI` button opens the assistant drawer.

## Evidence

Final screenshots and measurements:

`docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/visual-fidelity/`

State evidence:

`docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/visual-fidelity/states/`

Interaction evidence:

`docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/visual-fidelity/interactions/`

Residual `oil-ui` findings are limited to existing global shell text sizes, contrast, and boxed-group counts. No dashboard console error, failed image, horizontal overflow, card-bottom mismatch, or unhandled keyboard state was observed.
