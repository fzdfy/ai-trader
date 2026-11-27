# Future Week Forecast Visual Evidence

## Scope

- User task: inspect a stock's real historical daily K-line and a probabilistic
  path for the next five trading days without mistaking the forecast for fact.
- Primary viewport: `1440×900`; responsive check: `390×844`.
- Visual north star: a quiet research instrument where a blue probability lens
  extends the real chart, while amber is reserved for uncertainty and stale data.
- Production-aligned baseline:
  `../../live-market-stock-detail-signals-v1.html`.
- Exploration:
  `../../stock-five-day-forecast-v1.html`.

The public site was also checked as the latest reference, but zrok served an
interactive safety interstitial to the automated browser. The local production
aligned snapshot above contains the latest quick-detail hierarchy and signal
add-on available in the repository.

## Evidence

### Baseline

- `baseline/page-1440x900.png`
- `baseline/page-390x844.png`

### Complete page context

- `context-light/model-1440x900.png`
- `context-light/model-390x844.png`
- `context-dark/model-1440x900.png`
- `context-dark/model-390x844.png`

### Forecast states

`light/` and `dark/` each contain desktop and mobile screenshots for:

- `model`
- `baseline`
- `low`
- `stale`
- `unsupported`
- `unavailable`
- `error`

### Interaction states

- `interactions/model-day-detail-1440x900.png`
- `interactions/model-day-detail-390x844.png`
- `interactions/model-collapsed-1440x900.png`
- `interactions/model-collapsed-390x844.png`

## Review Notes

- Final independent visual review: **8/10**; no blocking findings; ready for
  user visual confirmation.
- Independent visual review rounds identified mobile history/forecast continuity,
  date-label collision, low-confidence hierarchy, duplicate unavailable-state
  copy, implementation jargon, baseline self-comparison and keyboard-focus
  precision. All listed blockers were revised and the final closure review found
  no remaining blocker before the current screenshots were captured.
- All state captures were taken from the real prototype in a local browser.
- Screenshot checks reported no console errors, failed images or page-level
  horizontal overflow.
- Light and dark state reports each contain 14 captures with zero lint findings.
- The historical K-line uses the product's A-share red-up/green-down convention.
- Forecast probability and confidence use brand blue and amber, not price
  direction colors.
- The mobile chart uses a compact history-plus-forecast frame so the latest
  historical candles, the complete forecast divider and all forecast sessions
  remain visible without page-level overflow.
- The baseline page has pre-existing low-contrast MA labels. The exploration
  uses readable ink for these labels and removes the unnecessary outer-card
  border nesting.
- Reduced motion is implemented with CSS media queries. It is a rendering
  behavior rather than a separate static visual state.
- Independent visual closure is complete; the user's visual direction
  confirmation remains pending.

## Limitations

- Forecast values are representative interface data, not a trained model run.
- Normal-speed motion feel and the actual `prefers-reduced-motion` runtime path
  remain implementation checks; the prototype declares the reduced-motion rule.
- The live zrok page required an interactive safety confirmation unavailable to
  the automated screenshot runner; the latest local production-aligned snapshot
  is used for comparison.
