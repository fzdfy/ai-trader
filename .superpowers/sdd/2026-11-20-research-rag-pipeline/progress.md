# SDD ledger — plan: docs/superpowers/plans/2026-11-20-research-rag-pipeline.md

Pre-flight: Task 1 defines `ResearchIndexJob`, queue keys and enqueue contract consumed by Tasks 2–4; Task 2 defines status/prepare/process contracts consumed by Tasks 3–6; Task 5 defines shared evidence retrieval consumed by Task 6 and existing Agent/API; Task 7 validates Tasks 2–5. Interfaces align with the approved design.

Ruling: Execute Native on the existing main worktree with the current uncommitted planning/design changes — the user explicitly selected Native here and isolating now would split the approved artifacts from implementation — cost if wrong: no isolated branch and commits include docs plus code together.

Visual gate: confirmed; prototype `docs/design/prototypes/explorations/quant-workbench-research-rag-v1.html`; screenshots under `docs/design/prototypes/explorations/screenshots/research-rag-v1/`.
Task 1: complete (commits 346d036..3744840, tests: research-index-contracts.test.ts → 1 passed)
Task 2: complete (database tests: research-index-service.test.ts + research-index-contracts.test.ts → 6 passed; server type check passed)
Task 3: complete (worker tests: processor.test.ts + research-index-contracts.test.ts → 5 passed; server type check and scoped lint passed; Docker/deploy wiring added)
