---
name: code-review
description: Review project changes for correctness, security, data safety, test gaps, and unnecessary complexity before merge or archive.
---

# Code Review

Read the OpenSpec change, its `tasks.md`, relevant standards, and all callers of changed interfaces.

Use `code-simplifier` for readability without behavior change. Use `requesting-code-review` for structured review and `ponytail-review` for the smallest sufficient design.

Every finding must identify a concrete trigger and consequence. Separate must-fix defects from simplification suggestions.

Verify claims with commands and file evidence. Report unverified areas rather than implying success.
