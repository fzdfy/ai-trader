---
name: database
description: Design or change market data ingestion, storage, synchronization, and point-in-time read behavior without breaking data contracts.
---

# Database

Read `docs/standards/database.md`, `docs/data-pipeline.md`, and `docs/invariants.md` before editing.

Separate realtime fetch, ingestion, and backtest reads. Preserve provider priority, raw-price ingestion, `hfq` backtests, PIT snapshots, idempotent writes, and the `load_kline` contract.

Development-time data-source knowledge may come from `a-stock-data`; production behavior must remain in code. Do not invent fallback sources.

Verify source health, expected trade date, coverage, idempotency, and any changed read contract.
