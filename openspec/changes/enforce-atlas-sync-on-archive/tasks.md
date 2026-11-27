# Tasks

## 1. Entry and workflow standards

- [x] 1.1 在 `AGENTS.md` 增加常驻约束：有视觉影响的变更归档前必须提升最终基准并更新、验证 Atlas；用 `rg -n "Atlas.*归档|归档.*Atlas" AGENTS.md` 验证入口可发现。
- [x] 1.2 更新 `docs/standards/sdd/v3.md` 的 Stage 7、Quality Gates 和 Failure Modes，明确缺失 Atlas 证据时禁止归档；用 `rg -n "Atlas|归档硬门禁" docs/standards/sdd/v3.md` 验证流程、质量门禁和风险条目均已覆盖。
- [x] 1.3 更新 `docs/standards/development-workflow.md` 的归档短流程和 `docs/standards/design.md` 的视觉资产生命周期，说明最终稿进入 `initial/`、Atlas 条目和浏览器证据；用 `rg -n "Atlas" docs/standards/development-workflow.md docs/standards/design.md` 验证两份文档一致。
- [x] 1.4 更新 `openspec/config.yaml` 的视觉归档上下文和 archive guidance，使 OpenSpec 运行时同样阻断缺失 Atlas 证据的归档；用 `rg -n "Visual archive gate|Atlas single entry|does not waive" openspec/config.yaml` 验证配置可被 apply/archive 读取。

## 2. Archive execution

- [x] 2.1 更新 `.agents/skills/openspec-archive-change/SKILL.md`，在移动 change 目录前读取 `visual` 并执行 Atlas 硬门禁，缺失最终基准、Atlas 条目、截图入口或浏览器验证时停止；用 `rg -n "Atlas|visual: not-applicable|最终基准" .agents/skills/openspec-archive-change/SKILL.md` 验证检查位于归档步骤之前。

## 3. Integration verification

- [x] 3.1 运行 `./node_modules/.bin/openspec validate enforce-atlas-sync-on-archive --strict`、`git diff --check` 和文档关键词检查，确认 Spec 增量、流程入口与归档 Skill 使用同一条 Atlas 完成条件。

## Workflow follow-up

- 测试和验证完成后提交用户验收；只有用户单独确认归档后，才执行 OpenSpec archive。
- 归档时同步 `ai-coding-workflow` 和 `preline-workbench-ui` 增量规格。
- 本变更本身为 `visual: not-applicable`，归档时不需要更新 Atlas。
