# Market Center Boards Pagination

Production captures from 2026-11-24 for the board-module refinement.

- `desktop-industry-1440x900.jpg`
- `desktop-industry-all-heatmap-1440x900.jpg`
- `desktop-industry-rotation-1440x900.jpg`
- `mobile-industry-390x844.jpg`

Implemented behavior:

- Industry and concept rankings show 10 rows per page.
- Board ranks are sorted numerically (`1, 2, 3 ...`), not lexicographically
  (`1, 10, 100 ...`), so later pages contain the real bottom-ranked boards.
- Industry and concept rotation tables show 10 ranked rows per page.
- Board-detail constituents show 10 stocks per page.
- Pagination preserves first/last/nearby pages and exposes previous/next
  controls with keyboard focus.
- Industry ranking currently reports `1–10 / 496`; industry rotation reports
  `1–10 / 496`; concept ranking reports `1–10 / 554`; concept rotation reports
  `1–10 / 549`; semiconductor constituents report `1–10 / 188`.
- Board heatmap uses a 20-item aligned bento grid. It selects the largest
  unique boards across the complete board list, removes exact duplicate
  cap/change rows, and maps market-cap rank to varied shared `2×2`, `2×1`,
  `1×2` and `1×1` spans. Desktop uses four columns and seven aligned rows;
  mobile uses three
  columns. Color remains the daily change percent.
- Tile colors use one-percent discrete ranges in numeric order: `≤-3%`,
  `-3–-2%`, `-2–-1%`, `-1–0%`, `0%`, `0–1%`, `1–2%`, `2–3%` and `≥3%`.
  Only the `≤-3%` and `≥3%` ends use solid deep green and red; intermediate
  non-zero ranges use 25%, 50% or 75% semantic color mixes. `0%` remains gray
  and there is no interpolation inside a range.
- The legend uses a colored dot plus neutral range text for every step instead
  of giving each label its own colored button background.
- Rotation uses a four-row quadrant summary on the left and a 10-row table on
  the right. The four rows fill the full width and height of the left panel.
  Each quadrant shows the first three available boards in current rank order,
  with relative return, rank, rank change and fund confirmation. Board entries
  are transparent by default and reveal a panel background only on hover or
  keyboard focus. On mobile the rows keep a compact fixed height instead of
  collapsing.
- The 5/20/60-day rotation window selector lives in the rotation card header
  and is not presented as a page-level filter.
- Desktop and mobile pages have no page-level horizontal overflow.
- The market-center shell fills the workspace instead of stopping at the old
  `1480px` maximum width.
