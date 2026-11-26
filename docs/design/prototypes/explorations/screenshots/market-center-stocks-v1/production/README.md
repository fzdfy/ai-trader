# Production Acceptance Screenshots

Real-browser captures from the deployed `http://localhost:9180` build on 2026-11-25.

## Stock list

- `stock-list-light-desktop-1440x900.jpg`
- `stock-list-light-mobile-top-390x844.jpg`
- `stock-list-light-mobile-pagination-390x844.jpg`
- `stock-list-dark-desktop-page2-1440x900.jpg`
- `stock-list-dark-mobile-page2-390x844.jpg`
- `stock-search-result-light-mobile-390x844.jpg`
- `stock-search-empty-light-mobile-390x844.jpg`
- `stock-watchlist-light-mobile-390x844.jpg`

## Quick quote detail

- `stock-detail-light-desktop-1440x900.jpg`
- `stock-detail-light-mobile-top-390x844.jpg`
- `stock-detail-light-mobile-chart-funds-390x844.jpg`
- `stock-detail-light-mobile-funds-390x844.jpg`
- `stock-detail-dark-desktop-1440x900.jpg`
- `stock-detail-dark-mobile-390x844.jpg`
- `stock-detail-empty-light-desktop-1440x900.jpg`
- `stock-detail-empty-light-mobile-390x844.jpg`
- `stock-detail-empty-dark-desktop-1440x900.jpg`
- `stock-detail-loading-dark-desktop-1440x900.jpg`
- `stock-detail-error-dark-desktop-1440x900.jpg`
- `stock-detail-error-dark-mobile-390x844.jpg`

The browser showed a fixed white chart and fund surface in both themes. Errors were induced by stopping the local API and waiting for the 15-second K-line timeout; retrying after the API restarted recovered the empty-data state.
