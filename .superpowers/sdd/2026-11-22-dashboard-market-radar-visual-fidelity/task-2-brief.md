# Task 2 Brief

Plan: `/Users/dakai/Documents/study/ai/ai-trader/docs/superpowers/plans/2026-11-22-dashboard-market-radar-visual-fidelity.md`

Spec: `/Users/dakai/Documents/study/ai/ai-trader/openspec/changes/refine-dashboard-market-radar-visual-fidelity/specs/preline-workbench-ui/spec.md`

## Deliverable

Replace the duplicate A-share tabs with a two-index quote overview that directly switches the selected index.

## Files

- Create: `apps/web/src/routes/home/-private/AShareIndexOverview.tsx`
- Modify: `apps/web/src/routes/home/-private/AShareMarketBoard.tsx`
- Modify: `apps/web/src/routes/home/-private/MarketRadarHero.tsx`
- Modify: `apps/web/src/lib/market-selection.test.ts`

## Required Behavior

- Index overview order is always 上证指数 then 创业板指.
- Each overview item shows name, code, price and percentage change.
- Missing ticker data keeps the slot and shows an unavailable state.
- Selecting either overview item changes only the A-share symbol.
- ETF and global ranges remain unchanged.

## Global Constraints

- Use current Market Brief data; no new API.
- Use the dashboard semantic tokens from Task 1.
- Preserve Apollo Quant shell and page navigation.
- Preserve keyboard access and visible focus.
