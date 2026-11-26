# SDD ledger — plan: docs/superpowers/plans/2026-11-24-market-center.md

Pre-flight: the working tree contains user edits outside this plan; preserve them and do not create broad commits.

Implementation: complete.
Verification: quant 51/51, server 206 passed + 50 opt-in skipped, web 87/87, check-types 2/2, lint 0 errors, build passed, production API and screenshots verified.
Ruling: industry/concept rotation reads `board_kline` instead of the three-day `board_history` snapshots — required for real 5/20/60-day rank change; wrong cost is unchanged-since requirements changing the source contract again.
Ruling: K-line detail keeps `klinecharts` and adds an explicit host height plus post-mount resize — required because the feature-gate shell mounts children late; wrong cost is a chart that renders at zero height.
Ruling: legacy signal deep links replace-navigate to the matching boards category — preserves bookmarks without maintaining duplicate pages; wrong cost is loss of old signal-specific UI features not present in the new boards view.
Final review: self-review (no delegated subagent authorized).
Archive: pending explicit user acceptance.

Main-index refinement visual gate:
- Created `docs/design/prototypes/explorations/quant-workbench-market-center-main-indices-v1.html`.
- Generated light/dark desktop and mobile screenshots for quote, benchmark-relative rotation, all required states, independent cross-asset rotation, and interactions.
- Browser checks report 0 console errors, 0 horizontal overflow, 0 missing images, 0 readability warnings, and 0 lint issues.
- Production code changed: no.
- User visual confirmation: confirmed on 2026-11-24.

Main-index refinement visual gate update:
- User confirmed design, including equal height between quote and benchmark-relative modes.
- Desktop primary card height verified at 805px in both modes; mobile height verified at 1269px in both modes.
- Implementation plan: `docs/superpowers/plans/2026-11-24-market-center-main-indices.md`.
- OpenSpec implementation tasks 10-14 added and remain incomplete.
- Production code changed: no.
