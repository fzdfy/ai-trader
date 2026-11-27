# Proposal

## Change Metadata

- type: feature
- risk: L2
- assurance: systemic
- baseline: spec
- visual: not-applicable

## Why

v2 已经取消普通变更的逐阶段和逐任务确认，但所有 L2 仍要求完整设计及独立评审。局部认证配置、单 Provider 修复和跨服务数据口径变化因此承担相同审查流程，独立评审成为 L2 中最固定的等待与上下文成本。

本次变更把 L2 的风险等级与保证强度拆开：认证、数据、PIT 等仍至少为 L2，但只有系统性影响才在实施前增加独立设计评审；局部且可回滚的 L2 改为实施后一次独立代码与风险评审。

## What Changes

- 新增 SDD v3，并将 v2 标记为历史基线；已启动或已归档变更不强制迁移。
- 为 L2 增加 `assurance: bounded | systemic`，在 proposal 分类阶段初选，并由完整设计确认。
- `bounded` 必须同时满足 AC-2 列出的五项条件；`systemic` 表示任一条件不满足或分类存在争议。
- 完整设计或实施过程发现档位条件不再成立时，必须硬停并升级为 `systemic`，重新确认规划后才能继续。
- 实施开始后不得把 `systemic` 降为 `bounded`；实施前确需降级时必须硬停、重新分类并取得用户确认。
- `bounded` L2 取消实施前的独立设计评审，保留用户规划确认、实施后独立代码与风险评审、完整验证和回滚证据。
- `systemic` L2 同时保留实施前独立设计评审和实施后独立代码与风险评审。
- 认证、权限、数据源、PIT、回测口径、公共 API、跨服务和迁移仍至少按 L2 分类，不因 `bounded` 降低为 L1。
- 保持现有 OpenSpec 五件套、TDD、视觉门禁、用户验收及独立归档确认不变。
- 更新 `AGENTS.md`、SDD 版本索引、迁移说明、OpenSpec 配置和领域术语，使新规则只有一个事实源。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ai-coding-workflow`: L2 增加 bounded/systemic 保证档位，并按影响范围调整独立设计评审时机。

## Acceptance Criteria

- **AC-1**：新变更在 `risk: L2` 时必须在分类阶段初选并在 proposal 声明 `assurance: bounded | systemic`；L0/L1 不要求该字段。
- **AC-2**：只有同时满足以下五项条件的 L2 才能标记为 `bounded`：
  1. 影响局限在一个可独立部署的服务、Provider 适配器或部署配置边界；
  2. 不改变数据库 schema、数据语义、PIT、复权或回测口径；
  3. 不改变权限模型、公共 API 或跨服务契约；
  4. 可通过回滚代码或配置恢复，无需数据修复、重放或人工迁移；
  5. 现有测试和验证能够覆盖改动边界。

  任一条件不满足或分类有争议时必须标记为 `systemic`。
- **AC-3**：`bounded` L2 不要求在实施前完成独立设计评审；必须在实施后先完成独立代码与风险评审、修复 findings，再运行最新完整验证，之后才能请求用户验收。
- **AC-4**：`systemic` L2 必须完成实施前独立设计评审和实施后独立代码与风险评审；任一 `changes-required` 未清零时不得进入下一阶段。
- **AC-5**：认证、权限、数据源、PIT、回测口径、迁移、公共 API 和跨服务变更仍至少为 L2，`bounded` 不得用于降低风险等级或跳过测试、回滚与用户确认；所有 L2 的 `changes-required` 必须在请求验收前清零。
- **AC-6**：SDD v3 成为当前流程，v2 保留为历史；已启动或已归档变更不得被自动改写。
- **AC-7**：项目入口、OpenSpec 配置和术语对五项 bounded 条件、`bounded`、`systemic` 与 L2 的描述一致，且不存在仍把全部 L2 强制为实施前独立设计评审的现行规则。
- **AC-8**：本变更不改变默认 OpenSpec 五件套、TDD、视觉门禁、最终验收和独立归档确认。

## Impact

- 流程标准：`docs/standards/sdd/v3.md`、`docs/standards/sdd/README.md`、`docs/standards/sdd/v2-to-v3.md`
- 入口与导航：`AGENTS.md`、`docs/standards/development-workflow.md`、`docs/README.md`
- OpenSpec 配置：`openspec/config.yaml`
- 领域语言：`docs/glossary.md`
- 系统行为规格：`openspec/specs/ai-coding-workflow/spec.md`
- 业务代码、API、数据库、运行时和 UI：无影响
- 兼容性：v2、v1 和既有归档保留；新变更默认使用 v3
- 回滚：恢复入口和索引至 v2，并保留 v3 文件作为审计记录

## Visual Design Impact

Visual design: not applicable.

本次只修改 AI Coding 流程标准、项目入口、OpenSpec 配置和术语，不新增或修改页面、组件、可见状态、交互、信息层级、响应式或明暗模式。
