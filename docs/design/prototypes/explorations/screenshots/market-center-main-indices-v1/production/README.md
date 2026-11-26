# Production Evidence

Captured on 2026-11-24 from `http://localhost:9180/home/market` using real
market-center API data.

## Available states

- `light/desktop-quote-1440x900.jpg`
- `light/desktop-relative-1440x900.jpg`
- `light/mobile-quote-390x844.jpg`
- `light/mobile-relative-390x844.jpg`
- `dark/desktop-quote-1440x900.jpg`
- `dark/desktop-relative-1440x900.jpg`
- `dark/mobile-quote-390x844.jpg`
- `dark/mobile-relative-390x844.jpg`
- `dark/mobile-keyboard-focus-390x844.jpg`

## Measurements

- Desktop main-index card: `805px` in both quote and relative modes.
- Mobile main-index card: `1269px` in both quote and relative modes.
- Page `scrollWidth` equals viewport width at `1440px` and `390px`.
- Switching modes preserves keyboard focus; Tab moves from the mode
  selector into the relative-window selector with a visible focus ring.
- The independent cross-asset window selector changes only cross-asset
  values; the main-index window remains unchanged.
- Browser console error log was empty.

Loading, empty, error, partial, stale and insufficient-sample visuals were
validated in the confirmed exploration reports in the parent directory and
by automated service tests. Production captures use real data and therefore
show the available state.
