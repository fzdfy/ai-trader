# Market Center Style Refinement

Production captures from 2026-11-24 after aligning the overview with the
confirmed main-index design.

- `desktop-light-1440x900.jpg`
- `desktop-light-lower-1440x900.jpg`
- `desktop-dark-1440x900.jpg`
- `desktop-dark-lower-1440x900.jpg`
- `mobile-light-390x844.jpg`
- `mobile-light-lower-390x844.jpg`
- `desktop-light-funds-final-1440x900.jpg`
- `mobile-light-funds-final-390x844.jpg`
- `desktop-light-design-surfaces-1440x900.jpg`
- `desktop-light-benchmark-radius-1440x900.jpg`
- `desktop-light-benchmark-gradient-final-1440x900.jpg`

Verified outcomes:

- Industry breadth is based on the 496 industry rows, not the combined
  industry + concept total.
- The breadth narrative is derived from live data. The current sample reads
  `行业广度偏弱，防守风格继续领先`; the positive-growth case is covered by a
  unit test that returns `行业广度偏强，成长风格继续领先`.
- The market-temperature card shows seal rate, limit-up ladder, industry
  fund evidence, concept fund evidence and then limit-up industry
  concentration.
- The repeated `主力资金极值与涨停行业集中度` block is removed.
- Fund evidence uses separate flat panel cards with a semantic primary tag;
  the previous translucent/gradient surface was removed.
- Fund metric and business date are separate lines, and the date has
  `white-space: nowrap`, preventing the previous `2026-11-` / `24` split.
- The three highlighted surfaces now follow their distinct design values:
  the benchmark uses a primary-soft gradient, the temperature stats use a
  surface/panel mix, and the growth/breadth band uses the amber wash over a
  separate surface mix. They are intentionally not forced to one color.
- The benchmark row is inset with the same `13px` radius as the confirmed
  design, and the six-index grid is enclosed in the matching rounded surface.
- The benchmark gradient uses a lighter 6% primary wash, a 3% midpoint at
  42%, and fades to the panel at 88% for a smoother transition.
- Desktop main-index and market-temperature cards are both `940px`.
- Mobile main-index height is `1430px`; quote and relative modes use the same
  height.
- `scrollWidth` matches `1440px` and `390px` viewports, with no horizontal
  overflow and no browser console errors.
