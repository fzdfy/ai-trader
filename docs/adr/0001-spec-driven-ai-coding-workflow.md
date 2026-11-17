# 使用 OpenSpec 与分阶段 Agent Skills 驱动开发

## Status

accepted

## Context

需求、长期标准、视觉原型和实施任务分散在飞书、源码和临时对话中，Agent 容易跳过澄清、测试或验证直接改代码。

## Decision

项目使用 `docs/standards/` 保存长期事实，`.agents/skills/` 保存可执行方法，OpenSpec 保存长期规格和单次变更。按阶段路由 Grill-with-docs、OpenSpec、Superpowers、Ponytail 和 Code Simplifier，不一次性加载全部 skills。

## Consequences

每个非平凡变更都要经过规划产物、失败测试、实施、精简、审查和验证。流程成本增加，但需求可追溯，Agent 行为和验收证据更稳定。
