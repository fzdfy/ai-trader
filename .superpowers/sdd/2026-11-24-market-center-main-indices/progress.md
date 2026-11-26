# SDD ledger — plan: docs/superpowers/plans/2026-11-24-market-center-main-indices.md

Pre-flight: Tasks 1 and part of Task 2 were already implemented in the shared dirty worktree and verified by 7/7 quant and 9/9 server tests. Preserve unrelated user edits; no branch-wide commits.
Pre-flight: shared interfaces checked — `MAIN_INDEX_SYMBOLS` is the single seven-symbol catalog consumed by storage, sync, quotes, rotation, and web; no conflict found.
Task 1: complete (pre-existing implementation; quant index rotation 8/8 passed after adding the route contract test).
Task 2: complete (quant main-index client and sync wired; 9/9 storage/sync tests passed).
Task 3: complete (benchmark and quote services plus API integration; targeted 20/20 server tests passed).
Task 4: complete (Web contracts and `main-benchmark` hook; web tests and type check passed).
Task 5: complete (fixed seven-index UI and independent cross-asset panel; web 89/89 and production interaction checks passed).
Task 6: complete (full suites, Docker rebuild, real API, light/dark desktop/mobile screenshots and K-line/boards regression checks passed; final quant 55/55, server 218 passed + 50 skipped, web 89/89).
Ruling: Partial relative history keeps valid excess returns but removes every rank below four style peers — preserves observable evidence without implying a ranking — cost is a low-quality relative view that still shows numeric differences.
Ruling: The seven-index quote endpoint keeps per-item timestamps instead of a shared snapshot label — required by the confirmed mixed realtime/official-close design — cost is visually denser provenance text.
Final review: self-review (no delegated subagent authorized).
Final: fixed relative-mode omitted missing style slots — benchmark test RED→GREEN now asserts all six fixed rows and suite is 218/218 executed tests green.
Archive: pending explicit user acceptance.
