# Proposal

## Change Metadata

- type: feature
- risk: L1
- baseline: spec
- visual: not-applicable

## Why

视觉探索稿、真实实现截图和 Atlas 当前全量入口之间缺少强制的归档同步动作。现有规范虽然写了“确认并落地后回写 Atlas”，但归档 Skill 没有检查这一步，导致多次变更完成后，最终确认的设计仍只留在
`explorations/`，Atlas 继续显示旧页面或缺少对应条目。

## What Changes

- 为有视觉影响的变更增加归档硬门禁：必须先把最终确认稿提升为 `initial/` 基准，并更新
  `docs/design/prototypes/atlas/index.html` 的对应页面、来源变更和截图入口。
- 将 Atlas 回写放在归档阶段，而不是视觉确认时：视觉确认后仍可能因实现、评审或数据接入调整最终稿；归档只能记录用户实际验收的版本。
- `verification.md` 必须记录 Atlas 条目、最终基准路径、截图索引和真实浏览器验证结果。
- `openspec-archive-change` 在移动 change 目录前检查视觉影响；缺少 Atlas 同步证据时停止归档，不以“用户已确认归档”替代。
- `visual: not-applicable` 的变更免于 Atlas 回写，但 proposal 必须继续说明无可见 UI 影响的理由。
- 同步更新 `AGENTS.md`、SDD v3、开发工作流短入口和 UI 设计标准，使规则只有一个长期事实源。
- 本规则从本变更完成后生效，不自动回填历史变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-coding-workflow`: 归档前增加视觉 Atlas 同步门禁和证据要求。
- `preline-workbench-ui`: 用户确认且最终落地的视觉版本必须提升为基准并进入 Atlas。

## Impact

- 流程入口：`AGENTS.md`、`docs/standards/development-workflow.md`
- 完整流程：`docs/standards/sdd/v3.md`
- UI 与原型标准：`docs/standards/design.md`
- OpenSpec 运行时指导：`openspec/config.yaml`
- 归档执行：`.agents/skills/openspec-archive-change/SKILL.md`
- 能力增量：`ai-coding-workflow`、`preline-workbench-ui`
- 页面代码、API、数据库和运行时：无变化
- 历史探索稿和已归档变更：不重写；如需补齐 Atlas，单独发起回填任务

## Acceptance Criteria

- **AC-1**：视觉影响为 `regression` 或 `new-design` 的变更，在归档前 MUST 将用户验收的最终设计稿提升到
  `docs/design/prototypes/initial/`，并保留原探索稿。
- **AC-2**：归档前 MUST 更新 `docs/design/prototypes/atlas/index.html`，使该页面可从 Atlas 单入口打开，并关联本次 change 名称、最终基准稿和关键截图或截图索引。
- **AC-3**：`verification.md` MUST 记录 Atlas 条目、最终基准路径、截图索引和真实浏览器验证结果；缺少任一项时不得归档。
- **AC-4**：`openspec-archive-change` MUST 在移动 change 目录前检查视觉影响和 Atlas 证据；用户只确认归档只能授权执行归档，不能替代缺失的视觉同步。
- **AC-5**：`visual: not-applicable` 的变更 MUST 明确写出无可见 UI 影响的理由，并可不更新 Atlas。
- **AC-6**：`AGENTS.md`、SDD v3、开发工作流、UI 设计标准和归档 Skill 对 Atlas 门禁的描述 MUST 一致。
- **AC-7**：本变更不修改生产页面、Atlas 当前内容或历史视觉稿，也不自动回填此前遗漏的视觉变更。

## Visual Design Impact

Visual design: not applicable.

本次只修改流程文档、归档 Skill 和 OpenSpec 行为规格，不新增或修改页面、组件、可见状态、交互、信息层级、响应式或明暗模式。它约束未来有视觉影响变更的归档动作，本身不产生新的视觉设计稿。
