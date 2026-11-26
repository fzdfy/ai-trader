# Task 1 Brief

Plan: `/Users/dakai/Documents/study/ai/ai-trader/docs/superpowers/plans/2026-11-22-dashboard-market-radar-visual-fidelity.md`

Spec: `/Users/dakai/Documents/study/ai/ai-trader/openspec/changes/refine-dashboard-market-radar-visual-fidelity/specs/preline-workbench-ui/spec.md`

## Deliverable

Add dashboard semantic tokens and the `formatChangePct(value: number | null): string` helper.

## Files

- Modify: `apps/web/src/styles/themes/preline/ai-trader.css`
- Modify: `apps/web/src/lib/market-brief.ts`
- Modify: `apps/web/src/lib/market-brief.test.ts`

## TDD Steps

1. Add assertions:
   - `formatChangePct(-1.234) === "-1.23%"`
   - `formatChangePct(null) === "—"`
2. Run `node --test --experimental-strip-types src/lib/market-brief.test.ts` and confirm RED because the export is missing.
3. Implement the helper.
4. Add light/dark tokens for A-share, global, ETF, signal gradient, and dashboard soft shadow; expose needed colors through `@theme inline`.
5. Run `node --test --experimental-strip-types src/lib/market-brief.test.ts && pnpm check-types && pnpm lint`.

## Global Constraints

- No production UI composition changes in Task 1.
- Use semantic Preline tokens; no raw hex in business components.
- Preserve current API and data behavior.
