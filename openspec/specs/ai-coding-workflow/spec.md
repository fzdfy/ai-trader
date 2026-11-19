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

项目 SHALL 按需求澄清、PRD、规格、方案、方案评审、任务与测试计划、实施、测试报告、审查和归档阶段选择专用 skill。

#### Scenario: A fuzzy feature request arrives
- **WHEN** 需求存在范围、边界或异常场景不确定性
- **THEN** Agent MUST 使用 Grill-with-docs 进行文档约束下的澄清，并将确认结果记录为术语、ADR 或规格输入

#### Scenario: Clarified work needs product requirements
- **WHEN** 需求已有明确目标和验收标准
- **THEN** Agent MUST 在 `proposal.md` 中完成 PRD-lite，覆盖目标用户、场景、成功指标、非目标和验收标准
- **AND** 大型跨团队需求 MUST 生成独立 PRD

#### Scenario: Clarified work needs a technical approach
- **WHEN** PRD 与能力规格完成
- **THEN** Agent MUST 使用 Brainstorming 生成技术方案
- **AND** 技术方案 MUST 经过评审，并在 `design.md` 记录 `approved` 或 `changes-required`
- **AND** `changes-required` 未清零前 MUST NOT 编写生产代码

#### Scenario: Implementation starts
- **WHEN** OpenSpec 规划产物已就绪且用户授权实施
- **THEN** Agent MUST 使用 `writing-plans` 生成任务级实施与测试计划
- **AND** `tasks.md` MUST 作为唯一实施进度清单，并按 TDD 先写失败测试

#### Scenario: Implementation is complete
- **WHEN** 任务清单全部实施完成
- **THEN** Agent MUST 形成测试报告，再执行 Code Simplifier、代码审查、Ponytail Review 和 OpenSpec 验证

### Requirement: Each change has complete planning artifacts

OpenSpec 变更 SHALL 包含提案、能力规格、设计、任务与验证结果，并能从任务追溯到验收场景。

#### Scenario: A change is proposed
- **WHEN** 创建新的 OpenSpec 变更
- **THEN** 变更 MUST 包含带 PRD-lite 的 proposal、至少一个 capability spec、带评审结论的 design 和非空 tasks

#### Scenario: A task is completed
- **WHEN** Agent 将任务标记完成
- **THEN** 对应失败测试、GREEN 结果或静态检查证据 MUST 记录在任务或测试报告中，不得仅凭代码已修改判断完成

### Requirement: Test plans and reports close the verification loop

变更 SHALL 在编码前定义测试计划，在归档前形成测试报告。

#### Scenario: Test plan is created before implementation
- **WHEN** 技术方案与用户确认已完成
- **THEN** 实施计划 MUST 列出每个任务的失败测试、测试文件、验证命令和预期结果
- **AND** 测试范围 MUST 说明单元、接口、集成、E2E、异常态、回归及必要的性能和安全测试

#### Scenario: Test report is created before archive
- **WHEN** 实施任务全部完成
- **THEN** `verification.md` MUST 记录通过、失败、跳过、未覆盖项和环境阻塞
- **AND** 最终完成验证 MUST 重新运行完整命令，并确认结果与测试报告一致

### Requirement: Verification precedes completion claims

Agent SHALL 在声明完成、通过或修复前运行最新验证命令，并报告实际结果与未覆盖项。

#### Scenario: Agent reports passing checks
- **WHEN** Agent 声称类型检查、测试或构建通过
- **THEN** Agent MUST 在同一轮工作中运行对应完整命令并引用实际输出

#### Scenario: Verification cannot run
- **WHEN** 环境缺少所需命令或服务
- **THEN** Agent MUST 明确报告阻塞原因，不得推断为通过
