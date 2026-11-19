---
name: frontend
description: Implement and review React, TanStack, Tailwind, and Preline frontend changes using this project's structure and quality gates.
---

# Frontend

Read `docs/standards/frontend.md`, `docs/standards/design.md`, and `AGENTS.md` before editing.

Use `oil-ui` for visual direction and UI review, and `react-best-practices` for React implementation. Prefer existing hooks and components. Use TanStack Query for server state and Preline only for DOM behavior.

Use `preline/non-auto` and clean up manual plugin instances. Avoid new dependencies when existing code or platform primitives can solve the task.

Verify with the web type check, lint, and build commands. For visual changes, inspect real browser screenshots at desktop and mobile widths.
