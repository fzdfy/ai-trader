# Verification

## Result

- Date: 2026-11-27
- Status: PASS
- Tasks: 6/6 complete
- Visual design: not applicable; this change only updates workflow documentation,
  capability deltas and the archive Skill.
- User acceptance: pending
- Archive: not run
- Atlas update for this change: not required

## Acceptance Criteria

| AC | Evidence | Result |
|---|---|---|
| AC-1 | `docs/standards/design.md#归档同步` requires the final accepted visual to be promoted to `initial/` | PASS |
| AC-2 | `docs/standards/design.md` and `docs/standards/sdd/v3.md` require a current Atlas entry linked to the change, final baseline and screenshot evidence | PASS |
| AC-3 | `docs/standards/design.md` and `docs/standards/sdd/v3.md` require the Atlas paths and browser result in `verification.md` | PASS |
| AC-4 | `.agents/skills/openspec-archive-change/SKILL.md` runs the Atlas gate before moving the change and explicitly says archive confirmation does not waive it | PASS |
| AC-5 | `.agents/skills/openspec-archive-change/SKILL.md` checks a concrete reason for `visual: not-applicable`; this change records its own no-visible-UI reason | PASS |
| AC-6 | The same gate appears in `AGENTS.md`, SDD v3, the workflow short entry, UI design standard, `openspec/config.yaml`, archive Skill and two capability deltas | PASS |
| AC-7 | No files under `apps/` changed for this change | PASS |

## Commands

### OpenSpec validation

```text
$ ./node_modules/.bin/openspec validate enforce-atlas-sync-on-archive --strict
Change 'enforce-atlas-sync-on-archive' is valid
```

### Task status

```text
$ ./node_modules/.bin/openspec instructions apply --change enforce-atlas-sync-on-archive --json
state: all_done
progress: 6/6 complete, 0 remaining
```

### Archive gate ordering

```text
$ awk '/^5\. \*\*Enforce visual archive synchronization/{enforce=NR}
  /^6\. \*\*Perform the archive/{perform=NR}
  END { print "enforce=" enforce, "perform=" perform }' \
  .agents/skills/openspec-archive-change/SKILL.md
enforce=168 perform=202 ordered=yes
```

### Cross-document consistency

```text
$ rg -n "视觉归档门禁|用户确认归档只授权|visual: regression \| new-design|视觉变更：提升 initial|Atlas 滞后|Enforce visual archive synchronization|Archive confirmation does not waive|Atlas 条目必须关联" AGENTS.md docs/standards/sdd/v3.md docs/standards/development-workflow.md docs/standards/design.md .agents/skills/openspec-archive-change/SKILL.md
```

Required phrases were found in the entry rule, complete workflow, short workflow,
design standard, OpenSpec runtime configuration and archive Skill.

```text
$ rg -n "Visual archive gate|Atlas single entry|does not waive" openspec/config.yaml
27:  Visual archive gate:
29:  - The Atlas entry MUST identify the source change, link the final baseline ...
30:  - Missing final baseline, Atlas entry or browser evidence MUST block archive. ...
73:      - "Open the Atlas single entry and verify the final baseline and evidence links; ..."
```

```text
$ ./node_modules/.bin/openspec instructions archive \
  --change enforce-atlas-sync-on-archive --json | jq -r '.context' |
  rg -n "Visual archive gate|Atlas entry|does not waive"
24:Visual archive gate:
26:- The Atlas entry MUST identify the source change, link the final baseline ...
27:- Missing final baseline, Atlas entry or browser evidence MUST block archive. ...
```

The archive instruction response consumes the new runtime context, so the rule is
available to the command path that performs archiving rather than existing only in
standalone documentation.

```text
$ rg -n "Atlas" docs/standards/development-workflow.md docs/standards/design.md AGENTS.md .agents/skills/openspec-archive-change/SKILL.md openspec/changes/enforce-atlas-sync-on-archive/specs | wc -l
34
```

### Whitespace and production boundary

```text
$ git diff --check
(exit 0)

$ git diff --name-only -- apps
(no output)
```

## Files Changed

- `AGENTS.md`
- `docs/standards/sdd/v3.md`
- `docs/standards/development-workflow.md`
- `docs/standards/design.md`
- `openspec/config.yaml`
- `.agents/skills/openspec-archive-change/SKILL.md`
- `openspec/changes/enforce-atlas-sync-on-archive/**`

## Notes

- This change intentionally does not backfill old Atlas omissions.
- The archive gate is documented and ordered before the change-directory move.
- The next visual change to reach archive must exercise the new Atlas gate with
  its own final baseline, screenshots and browser verification.
