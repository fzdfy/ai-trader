# Proposal

## Why

当前 SDD v1 通过多份重复文档、每阶段确认和每任务确认来保证可追溯性，导致普通变更也承担接近大型项目的规划与上下文成本。与此同时，bug、UI 修复、重构和功能需求有不同的完成证据，却共用同一套重型材料，进一步放大重复记录。

本次变更将现有流程冻结为 v1，并建立风险分级的薄 SDD v2。v2 保留规格、TDD、视觉门禁、完成验证和归档约束，同时让变更类型只影响证据模板，让风险等级决定评审和执行强度。

## What Changes

- 新增版本化 SDD 文档：`docs/standards/sdd/v1.md`、`docs/standards/sdd/v2.md`、`docs/standards/sdd/v1-to-v2.md` 和版本索引。
- v1 完整记录当前流程、产物、确认门禁、Skill 路由及每个 Skill 的职责、输入、输出和使用条件，作为历史基线。
- v2 定义风险分级的薄 SDD：`feature | bug | ui | refactor | hotfix` 变更类型、`L0 | L1 | L2` 风险等级，以及 `spec | invariant | issue | confirmed-visual | none` 期望基线。
- v2 将 OpenSpec 作为规划与变更控制面；`docs/superpowers/specs` 和 `plans` 默认不再重复生成，只在 L2 或明确需要完整独立方案时使用。
- v2 保留 TDD、完成验证、视觉门禁和最终审查，取消普通变更的每任务确认、每任务账本和重复实施计划。
- 将 Superpowers 从必经流程框架降级为按需方法库：普通变更不要求 `using-superpowers`、`writing-plans` 或 `executing-plans`；L2 长任务可选择启用。
- 增加 bug、UI 回归、UI 设计变更、重构和 hotfix 的差异化完成证据；安全、数据、认证、迁移等风险始终覆盖变更类型。
- 更新 `AGENTS.md`、开发工作流标准和文档导航，使 v2 成为当前版本，v1 只作为历史与迁移参考。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-coding-workflow`: 将单一重型阶段流程改为带版本基线、风险分级、变更类型证据模板和按需 Skill 路由的 v2 工作流。

## Impact

- 流程标准：`docs/standards/development-workflow.md`、`docs/standards/sdd/*`
- Agent 入口：`AGENTS.md`
- 文档导航：`docs/README.md`、`docs/standards/README.md`
- OpenSpec 配置：`openspec/config.yaml` 中与变更路由、证据和确认有关的规则
- Skill 路由：不删除现有 Skill 文件，但调整项目中的强制性和使用阶段
- 业务代码、API、数据库和运行时：无影响
- 兼容性：已归档变更不重写；v1 文档保留可追溯；新变更默认使用 v2
- 回滚：恢复 `AGENTS.md` 和开发工作流入口，并将版本索引重新指向 v1；历史变更无需迁移

## Visual Design Impact

Visual design: not applicable.

本次只修改 SDD 流程文档、Agent 入口和 OpenSpec 规则，不新增或修改页面、组件、可见状态、交互、信息层级、响应式或明暗模式。
