# Market Center Stocks v2

Exploration for the next stock-page refinement:

- Search uses one uninterrupted gray-blue shell; the input has no native inner border.
- Stock and watchlist pagination uses 10 rows per page.
- Quick Quote Detail keeps only the stock name/code/price header above the K-line.
  The separate turnover, main-fund-flow and PE tiles are removed; fund structure follows
  the chart.
- The quote header, K-line and fund structure form one continuous detail card; the
  explaining line under the K-line heading is removed.
- The stock name is bold in one line with its code; OHLC and MA values live in a
  separate information strip so klinecharts legends do not cover the candles.

## Screenshots

- `list-light/`: stock list, desktop and mobile.
- `list-dark/`: dark stock list, desktop and mobile.
- `detail-light/`: summary → K-line → fund structure detail, desktop and mobile.
- `detail-dark/`: dark detail page with the fixed white data canvas, desktop and mobile.

Screenshot QA passed with no console errors, page-level horizontal overflow or failed images.

Deployed-build acceptance captures are indexed in
[`production/README.md`](./production/README.md).
