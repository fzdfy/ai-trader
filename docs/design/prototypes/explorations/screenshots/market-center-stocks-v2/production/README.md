# Production Acceptance

Real-browser captures from the deployed 2026-11-25 build:

- `stock-list-light-desktop-1440x900.jpg`
- `stock-list-light-mobile-390x844.jpg`
- `stock-detail-light-desktop-1440x900.jpg`
- `stock-detail-light-mobile-390x844.jpg`

The list renders 10 rows with range `1–10 / 5579`; the search control is one
gray-blue shell without a native inner border. The detail header contains only
the stock name, code, price and change, followed by the fixed-white K-line and
fund structure in one continuous card. Duplicate turnover, main-fund-flow and
PE tiles are absent, as is the explanatory line under the K-line heading.
The stock identity is one bold name + code line; OHLC/MA values are rendered above
the plot rather than as an overlaid klinecharts legend.
