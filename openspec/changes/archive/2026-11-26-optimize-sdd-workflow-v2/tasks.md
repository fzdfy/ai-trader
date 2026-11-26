# Tasks

Visual design: not applicable. This change only modifies workflow documentation, Agent entry rules, and OpenSpec configuration.

## 0. Review Gate

- [x] 0.1 Review `proposal.md`, the `ai-coding-workflow` delta and `design.md` for version compatibility, Skill-route conflicts, confirmation risk and rollback; update `design.md#Review Result` to `approved`, record the reviewer and date, and verify `rg -n '结论：.*(approved|changes-required)' openspec/changes/optimize-sdd-workflow-v2/design.md` returns exactly one definitive result.

## 1. Versioned SDD Baselines

- [x] 1.1 Create `docs/standards/sdd/README.md` with the v1/v2 status table, current-version declaration, reading order and shared definitions; verify it links all three companion documents and `rg -n "v2|当前|历史" docs/standards/sdd/README.md` shows v2 as current and v1 as historical.
- [x] 1.2 Create `docs/standards/sdd/v1.md` as a frozen, self-contained baseline covering principles, the actual sixteen stages, v1's informal work categories, artifacts, per-stage confirmations, OpenSpec/Superpowers relationship, complete v1-used Skill matrix and known costs; verify all required headings exist, the stage table has sixteen rows, and every Skill referenced by the v1 stage table, `AGENTS.md` and project domain rules appears in the matrix.
- [x] 1.3 Create `docs/standards/sdd/v2.md` as the v2 canonical workflow covering change metadata, L0/L1/L2 routing, feature/bug/ui/refactor/hotfix evidence, batch confirmations, hard stops, canonical artifacts, optional Superpowers execution and the complete Skill inventory; verify every change type and risk tier has a concrete route and each of the thirty installed `.agents/skills/*/SKILL.md` frontmatter names is classified exactly once as `required`, `conditional`, `optional` or `not-in-workflow` with responsibility, input, output and trigger.
- [x] 1.4 Create `docs/standards/sdd/v1-to-v2.md` with motivation, before/after stage mapping, artifact and path mapping, confirmation-policy changes, Skill keep/downgrade/optional decisions, compatibility, migration sequence, rollback and open historical items; verify every v1 artifact has either a v2 destination or an explicit withdrawal reason.

## 2. Adopt v2 as Current

- [x] 2.1 Rewrite `docs/standards/development-workflow.md` as a short entry to the v2 canonical workflow in `docs/standards/sdd/v2.md`, preserving only常驻 rules, read order and version routes; verify it defines no competing full stage table, links the SDD version index, and requires no default duplicate `docs/superpowers/plans`.
- [x] 2.2 Update `AGENTS.md` so v2 is the current workflow, change metadata and hard stops are visible, ordinary tasks no longer require per-task confirmation, TDD and final verification remain mandatory, and Superpowers is described as an on-demand method library rather than the control plane; verify `AGENTS.md` stays navigational and links the versioned SDD documentation.
- [x] 2.3 Update `docs/README.md` and `docs/standards/README.md` to route maintainers to the SDD version index and distinguish current v2 documentation from historical Superpowers artifacts; verify all new links resolve and no index still presents duplicate Superpowers designs as the default planning source.
- [x] 2.4 Update `openspec/config.yaml` context/rules to remove mandatory v1-only stages such as universal PRD-lite, universal independent design review, every-task confirmation and default `writing-plans`; retain conditional L2 review, visual gate, evidence and archive rules, and verify the YAML parses and `node_modules/.bin/openspec status --change optimize-sdd-workflow-v2 --json` succeeds.

## 3. Cross-version Validation

- [x] 3.1 Check the generated documentation as a set: required version headings and Skill matrix columns are identical between v1 and v2, every Skill occurrence has one documented responsibility, all thirty installed Skill names from each `SKILL.md` frontmatter are classified in v2, bug/UI/feature routes do not contradict the spec, and `rg -n '每阶段|每任务|PRD-lite|writing-plans|executing-plans|using-superpowers' docs/standards/sdd AGENTS.md docs/standards/development-workflow.md openspec/config.yaml` is manually classified as current, conditional, historical or removed.
- [x] 3.2 Run `node node_modules/@fission-ai/openspec/bin/openspec.js validate optimize-sdd-workflow-v2 --strict` and `git diff --check`; verify the four SDD documents with `node -e 'const fs=require("fs"),p=require("path");for(const f of fs.readdirSync("docs/standards/sdd").filter(x=>x.endsWith(".md"))){const text=fs.readFileSync(p.join("docs/standards/sdd",f),"utf8");for(const m of text.matchAll(/\]\(([^)#]+)/g)){const t=decodeURIComponent(m[1]);if(/^[a-z]+:/.test(t))continue;const q=p.resolve("docs/standards/sdd",t);if(!fs.existsSync(q)){console.error(`BROKEN ${f} -> ${t}`);process.exitCode=1}}}'`, then record any unavailable documentation test separately.
- [x] 3.3 Write `openspec/changes/optimize-sdd-workflow-v2/verification.md` with exact commands, results, version-document coverage, migration completeness, known limitations and confirmation that no runtime or visible UI behavior changed; verify its results match the latest command run.

## Workflow follow-up

- Request user acceptance after cross-version validation is complete.
- Archive only after separate user confirmation.
