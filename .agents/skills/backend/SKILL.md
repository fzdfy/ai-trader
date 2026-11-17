---
name: backend
description: Implement backend API, database, auth, worker, and observability changes using the project's security and data boundaries.
---

# Backend

Read `docs/standards/backend.md` and relevant OpenSpec specs before editing.

Derive identity from Better Auth sessions. Never trust client user IDs or roles. Keep routes thin, validate external input, use transactions for indivisible writes, and propagate request/job tracing.

For user-owned resources, implement server-side owner checks. For streams and workers, define cancellation, timeout, retry, and terminal states.

Verify with type checks, lint, targeted tests, and the affected API or worker behavior.
