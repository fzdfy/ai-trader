# Tasks

## 1. Standards and workflow

- [x] 1.1 Create `docs/standards/` files for architecture, frontend, backend, database, agent, and design; verify every Feishu source has a local corresponding document
- [x] 1.2 Add project-level workflow skills under `.agents/skills/` for UI design, frontend, backend, database, and code review; verify each directory contains a readable `SKILL.md`
- [x] 1.3 Update `AGENTS.md` with skill routing, file ownership, OpenSpec workflow, and verification gates; verify the document links to every standards file
- [x] 1.4 Add a project glossary and ADR recording the SDD workflow and mixed-library migration decision; verify the files follow the installed domain-modeling formats

## 2. Prototype preservation

- [x] 2.1 Snapshot `quant-workbench-assistant.html` into `docs/design/prototypes/initial/` without editing the original; verify both files have the same checksum
- [x] 2.2 Store the supplied workspace reference image under `docs/design/prototypes/assets/`; verify the file opens and is referenced by the prototype README
- [x] 2.3 Create `docs/design/prototypes/explorations/quant-workbench-preline.html` as an independent Preline exploration; verify it opens in a browser and the initial snapshot remains unchanged

## 3. Preline foundation

- [x] 3.1 Add Preline, Tailwind CSS v4, Vite integration, and Tailwind Forms dependencies; verify installation and lockfile updates
- [x] 3.2 Add the Vite Tailwind plugin and CSS entry imports; verify the web build resolves Tailwind and Preline CSS
- [x] 3.3 Add Preline semantic theme tokens for light and dark modes; verify theme tests cover mode resolution and token-independent persistence
- [x] 3.4 Add a Preline initialization component that runs after route rendering; verify type-checking and route changes do not duplicate plugin instances
- [x] 3.5 Add first-render theme restoration to prevent light/dark flicker; verify no direct storage access breaks non-browser builds

## 4. Application shell

- [x] 4.1 Replace the root Astryx top navigation with Preline navigation and responsive account menu while preserving `/home`, `/news`, and `/ai-chat`; verify links and sign-out behavior
- [x] 4.2 Create the Preline left navigation and shell used by `/home`; verify existing market, signal, review, quant, system, sync, and settings links still resolve
- [x] 4.3 Migrate `/login` and `/signup` to Preline forms and shared auth layout; verify successful, pending, and error states render correctly
- [x] 4.4 Add keyboard, focus, reduced-motion, and mobile drawer behavior; verify with browser keyboard navigation and a narrow viewport

## 5. Workbench home

- [x] 5.1 Change `/home` from a redirect into the Preline workbench landing page; verify `/home/market/boards` and other old routes remain reachable
- [x] 5.2 Add compact KPI strip driven by existing sync and market hooks; verify loading, empty, manual-sync, and failed states are explicit
- [x] 5.3 Add market trend and review panels using existing chart components or safe placeholders; verify no fabricated business values are shown when data is missing
- [x] 5.4 Add a task and workflow rail with links to review, factor iteration, screening, and backtest; verify each link routes to the existing feature
- [x] 5.5 Add the compact AI assistant panel with navigation to the existing AI chat; verify the panel does not create a second chat engine

## 6. Legacy route migration

- [x] 6.1 Migrate market and signal pages from Astryx primitives to Preline; verify charts and filters preserve current query behavior
- [x] 6.2 Migrate review and knowledge pages; verify tables, markdown, and outline behavior
- [x] 6.3 Migrate strategy, factor, screen, and backtest pages; verify forms, validation, code editors, and async task behavior
- [x] 6.4 Migrate sync, data-center, profile, and settings pages; verify tables, dialogs, progress, and theme controls
- [x] 6.5 Remove Astryx runtime, CSS, components, and dependency references after all routes pass visual QA; verify `rg "@astryxdesign" apps/web/src` returns no matches

## 7. Integration verification

- [x] 7.1 Run web type checking, lint, and production build; verify all commands exit successfully
- [x] 7.2 Run Playwright or browser-based visual checks at desktop and mobile widths for light and dark themes; verify screenshots show no clipping, focus loss, or console errors
- [x] 7.3 Validate OpenSpec artifacts and implementation coverage; verify `openspec validate establish-sdd-and-preline-workbench --strict` passes
- [x] 7.4 Perform code-simplifier and Ponytail review on the changed frontend files; verify significant findings are fixed or documented

## Workflow follow-up

- Run OpenSpec verification after all tracked tasks are complete.
- Archive the change only after implementation, visual QA, and review requirements are satisfied.
- Sync capability specs into the main spec store during archive.
