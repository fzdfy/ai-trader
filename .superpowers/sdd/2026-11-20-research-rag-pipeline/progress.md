# SDD ledger — plan: docs/superpowers/plans/2026-11-20-research-rag-pipeline.md

Pre-flight: Task 1 defines `ResearchIndexJob`, queue keys and enqueue contract consumed by Tasks 2–4; Task 2 defines status/prepare/process contracts consumed by Tasks 3–6; Task 5 defines shared evidence retrieval consumed by Task 6 and existing Agent/API; Task 7 validates Tasks 2–5. Interfaces align with the approved design.

Ruling: Execute Native on the existing main worktree with the current uncommitted planning/design changes — the user explicitly selected Native here and isolating now would split the approved artifacts from implementation — cost if wrong: no isolated branch and commits include docs plus code together.

Visual gate: confirmed; prototype `docs/design/prototypes/explorations/quant-workbench-research-rag-v1.html`; screenshots under `docs/design/prototypes/explorations/screenshots/research-rag-v1/`.
Task 1: complete (commits 346d036..3744840, tests: research-index-contracts.test.ts → 1 passed)
Task 2: complete (database tests: research-index-service.test.ts + research-index-contracts.test.ts → 6 passed; server type check passed)
Task 3: complete (worker tests: processor.test.ts + research-index-contracts.test.ts → 5 passed; server type check and scoped lint passed; Docker/deploy wiring added)
Task 4: complete (API tests: research-index.test.ts + index.test.ts → 13 passed; server type check and scoped lint passed)
Task 5: complete (retrieval/API tests: research-evidence-service.test.ts + research-index.test.ts + index.test.ts → 17 passed; server type check and scoped lint passed)
Task 6: complete (web tests → 43 passed; type check/lint passed; production screenshots: pending desktop/mobile, dark desktop, active evidence empty state)
Task 7: complete (21-case Golden Set → 21 passed, recall 1.0, keyword mode 21/21; retrievalVersion hybrid-keyword-v1)
Task 8: complete (18 real PDFs → 75 pages, 48 chunks/vectors; semantic Golden Set 19/21 vs forced keyword 21/21)
Review fixes: zero-report terminal cursor, trigger retry UI, active-job recovery guard, citable-only evidence, complete chunk coverage, reduced motion, final semantic Golden Set 19/21 and keyword 21/21
Final verification: server 154 pass/1 skip (155 total), workflow schema 1 pass, web 43 pass, quant 18 pass, types/build/lint/OpenSpec passed
