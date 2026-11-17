# ai-coding-workflow Specification

## Purpose

为项目建立可重复、可审计的规范驱动 AI Coding 行为，使需求、设计、实施、验证和归档在所有 Agent 会话中保持一致。

## Requirements

### Requirement: Standards have a single durable source

项目 SHALL 将长期技术标准保存于 `docs/standards/`，并将 `AGENTS.md` 保持为导航、硬约束和工作流入口。

#### Scenario: Agent starts a development task
- **WHEN** Agent 开始非平凡开发任务
- **THEN** Agent MUST 先读取 `AGENTS.md`、相关 `docs/standards/` 和既有 OpenSpec 规格

#### Scenario: A standard changes
- **WHEN** 项目规范发生变化
- **THEN** 变更 MUST 写入 `docs/standards/`，且 `AGENTS.md` 只更新必要入口或索引

### Requirement: Development workflow routes each phase to the correct capability

项目 SHALL 按需求澄清、规格、方案、任务、实施、简化、审查和归档阶段选择专用 skill。

#### Scenario: A fuzzy feature request arrives
- **WHEN** 需求存在范围、边界或异常场景不确定性
- **THEN** Agent MUST 使用 Grill-with-docs 进行文档约束下的澄清，并将确认结果记录为术语、ADR 或规格输入

#### Scenario: Clarified work needs a technical approach
- **WHEN** 需求已有明确目标和验收标准
- **THEN** Agent MUST 使用 OpenSpec 生成变更规划，并在编码前使用 Brainstorming 和 Ponytail 检查技术方案与最小实现

#### Scenario: Implementation starts
- **WHEN** OpenSpec 规划产物已就绪且用户授权实施
- **THEN** Agent MUST 以 `tasks.md` 作为唯一实施清单，并按 TDD 先写失败测试

#### Scenario: Implementation is complete
- **WHEN** 任务清单全部实施完成
- **THEN** Agent MUST 执行 Code Simplifier、代码审查、Ponytail Review 和 OpenSpec 验证后再归档

### Requirement: Each change has complete planning artifacts

OpenSpec 变更 SHALL 包含提案、能力规格、设计、任务与验证结果，并能从任务追溯到验收场景。

#### Scenario: A change is proposed
- **WHEN** 创建新的 OpenSpec 变更
- **THEN** 变更 MUST 包含 proposal、至少一个 capability spec、design 和非空 tasks

#### Scenario: A task is completed
- **WHEN** Agent 将任务标记完成
- **THEN** 对应验收证据 MUST 记录在任务或实施报告中，不得仅凭代码已修改判断完成

### Requirement: Verification precedes completion claims

Agent SHALL 在声明完成、通过或修复前运行最新验证命令，并报告实际结果与未覆盖项。

#### Scenario: Agent reports passing checks
- **WHEN** Agent 声称类型检查、测试或构建通过
- **THEN** Agent MUST 在同一轮工作中运行对应完整命令并引用实际输出

#### Scenario: Verification cannot run
- **WHEN** 环境缺少所需命令或服务
- **THEN** Agent MUST 明确报告阻塞原因，不得推断为通过
