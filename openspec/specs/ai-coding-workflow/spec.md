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

项目 SHALL 按变更类型、风险等级和已确认基线路由 v2 的规划、实施、验证与归档流程，并只加载当前步骤需要的 Skill。

#### Scenario: A fuzzy feature request arrives

- **WHEN** 需求存在范围、边界、用户流程或异常场景不确定性
- **THEN** Agent MUST 使用文档约束的澄清方法形成最小决策树
- **AND** 确认结果 MUST 进入术语、ADR、proposal 或能力规格之一

#### Scenario: Clarified work needs product requirements

- **WHEN** 变更新增用户功能、多页面流程、权限或数据口径
- **THEN** `proposal.md` MUST 包含紧凑 PRD-lite
- **AND** 仅跨团队、多阶段或需要独立产品评审的需求 MUST 生成完整 PRD

#### Scenario: Clarified work needs a technical approach

- **WHEN** 已澄清的工作存在非显然技术取舍、兼容风险或失败模式
- **THEN** Agent MUST 使用设计讨论形成替代方案、决策和风险
- **AND** 没有新增技术决策的 L1 变更 MUST 在 `design.md` 明确记录该结论

#### Scenario: A standard feature change is planned

- **WHEN** 变更属于 L1 feature 且没有新的高风险技术边界
- **THEN** Agent MUST 生成 OpenSpec proposal、能力增量、紧凑 design 和 tasks
- **AND** Agent MUST NOT 默认生成重复的 `docs/superpowers/specs` 或 `plans`

#### Scenario: A high-risk change is planned

- **WHEN** 变更涉及迁移、认证权限、数据源、PIT、回测口径、公共 API 或跨服务接口
- **THEN** 变更 MUST 按 L2 处理，并完成完整技术设计和独立评审
- **AND** `changes-required` 未清零前 MUST NOT 编写生产代码

#### Scenario: Implementation starts

- **WHEN** OpenSpec 规划产物已就绪且用户授权实施
- **THEN** Agent MUST 以 `tasks.md` 作为唯一实施进度清单
- **AND** 行为代码 MUST 按 TDD 先取得失败测试证据

#### Scenario: Implementation is complete

- **WHEN** 任务清单全部实施完成
- **THEN** Agent MUST 形成与最新命令一致的验证证据
- **AND** 风险适用的代码审查完成前 MUST NOT 归档

### Requirement: Each change has complete planning artifacts

OpenSpec 变更 SHALL 按风险保留 proposal、能力增量、design、tasks 与验证结果，并从任务追溯到变更类型对应的验收证据。

#### Scenario: A change is proposed

- **WHEN** 创建新的 OpenSpec 变更
- **THEN** 变更 MUST 声明 `type`、`risk`、`baseline` 和视觉影响
- **AND** 变更 MUST 包含 proposal、适用能力增量、design 和非空 tasks

#### Scenario: A standard change has no new technical decision

- **WHEN** L1 变更没有需要比较的技术方案
- **THEN** `design.md` MUST 明确记录“无新增技术决策”
- **AND** `design.md` MUST NOT 复制 proposal 的目标、非目标和验收标准

#### Scenario: A high-risk change is reviewed

- **WHEN** 变更被判定为 L2
- **THEN** `design.md` MUST 包含替代方案、失败模式、兼容性和回滚方式
- **AND** `Review Result` MUST 记录评审者、日期和批准状态

#### Scenario: A task is completed

- **WHEN** Agent 将任务标记完成
- **THEN** 对应失败测试、GREEN 结果或静态检查证据 MUST 记录在任务或测试报告中
- **AND** Agent MUST NOT 仅凭代码已修改判断完成

### Requirement: Test plans and reports close the verification loop

变更 SHALL 在实施前定义与变更类型相匹配的证据，并在归档前形成与最新验证运行一致的测试报告。

#### Scenario: Test plan is created before implementation

- **WHEN** 技术方案与用户确认已完成
- **THEN** 每个行为实施任务 MUST 列出失败测试、测试文件、验证命令和预期结果
- **AND** 文档或纯流程变更 MUST 列出适用的静态检查或内容校验命令

#### Scenario: Test report is created before archive

- **WHEN** 实施任务全部完成
- **THEN** `verification.md` MUST 记录通过、失败、跳过、未覆盖项和环境阻塞
- **AND** 最终完成验证 MUST 重新运行完整命令，并确认结果与测试报告一致

### Requirement: SDD versions preserve complete workflow baselines

项目 SHALL 在 `docs/standards/sdd/` 保存版本化 SDD 基线，将 v1 标记为历史流程、v2 标记为当前流程，并提供迁移记录。

#### Scenario: Maintainer inspects an SDD version

- **WHEN** 维护者打开 `docs/standards/sdd/v1.md` 或 `docs/standards/sdd/v2.md`
- **THEN** 文档 MUST 说明该版本的流程设计、阶段、产物、确认方式和完成条件
- **AND** 文档 MUST 列出该版本使用的 Skill、职责、输入、输出和使用阶段

#### Scenario: Agent resolves the current workflow

- **WHEN** Agent 开始新的非平凡变更
- **THEN** `docs/standards/sdd/README.md` MUST 将 v2 标识为当前版本
- **AND** Agent MUST 只把 v1 作为历史、审计或迁移参考

#### Scenario: Maintainer understands v1 to v2 migration

- **WHEN** 维护者需要比较两个版本
- **THEN** `docs/standards/sdd/v1-to-v2.md` MUST 说明变更原因、保留项、移除项、文件映射、确认变化、回滚方式和历史兼容策略

### Requirement: Change type and risk determine evidence

每个 v2 变更 SHALL 同时声明变更类型、风险等级和期望基线，并使用风险等级决定流程强度。

#### Scenario: An existing invariant or issue defines the expected behavior

- **WHEN** bug 的正确行为来自不变量的 `INV-*`、ADR 或问题记录
- **THEN** 变更 MUST 使用 `baseline: invariant`、`baseline: issue` 或明确的目标基线
- **AND** Agent MUST NOT 把已有约束误标为 `baseline: none`

#### Scenario: A bug is classified

- **WHEN** 现状偏离已经存在的规格、不变量、问题记录或已确认视觉基准
- **THEN** 变更 MUST 标记为 `bug` 或 `ui` 回归
- **AND** 完成证据 MUST 包含稳定复现和修复后的回归验证

#### Scenario: A behavior change is classified as a feature

- **WHEN** 项目需要新增或改变已经确认的外部行为
- **THEN** 变更 MUST 标记为 `feature`
- **AND** 完成证据 MUST 包含新的验收标准及其测试

#### Scenario: A UI-only correction is classified

- **WHEN** 变更只恢复已确认的视觉层级、样式或可见状态且不改变产品行为
- **THEN** 变更 MUST 使用 `ui` 类型和 `visual: regression`
- **AND** 变更 MUST 在编码前取得用户对基准差异或目标截图的确认
- **AND** 变更 MUST 记录受影响状态的前后截图、响应式、明暗主题和行为回归

#### Scenario: Risk overrides change type

- **WHEN** 小型 bug 或 UI 修改涉及认证、安全、数据迁移、数据源、PIT 或回测口径
- **THEN** 变更 MUST 按 L2 执行
- **AND** 变更类型 MUST NOT 被用于降低验证要求

### Requirement: Skills are routed by responsibility and trigger

项目 SHALL 将 Skill 作为按需能力目录，并仅在当前步骤满足触发条件时加载。

#### Scenario: A standard feature is implemented

- **WHEN** L1 feature 进入行为编码
- **THEN** TDD 和完成验证 MUST 被使用
- **AND** `using-superpowers`、`writing-plans` 和 `executing-plans` MUST NOT 成为必经流程

#### Scenario: A long high-risk plan is executed

- **WHEN** L2 变更任务较多、需要并行 Agent 或每个任务需要独立审查
- **THEN** 项目 MAY 启用完整实施计划、执行账本和任务级审查
- **AND** 启用后的账本 MUST 与 `tasks.md` 和 `verification.md` 保持一致

#### Scenario: A domain-specific change is implemented

- **WHEN** 变更涉及前端、后端、数据库或视觉设计
- **THEN** Agent MUST 加载对应的项目领域 Skill
- **AND** 通用流程 Skill MUST NOT 替代项目领域约束

### Requirement: Confirmations occur at decision and risk boundaries

v2 SHALL 在用户确认后允许按已批准计划连续执行低风险任务，并只在决策、风险和验收边界停止。

#### Scenario: A plan is approved

- **WHEN** 用户确认范围、验收、设计和 tasks
- **THEN** Agent MAY 连续执行该计划内的低风险任务
- **AND** Agent MUST NOT 要求用户逐项确认每个普通任务

#### Scenario: A hard boundary is reached

- **WHEN** 实施遇到范围变化、新的产品决策、认证数据边界、破坏性操作、新增依赖或无法按计划处理的失败
- **THEN** Agent MUST 停止并请求用户决策

#### Scenario: Final acceptance and archive occur

- **WHEN** 实施和验证完成
- **THEN** Agent MUST 先请求用户验收
- **AND** 只有用户单独确认归档后，Agent MUST 才可执行归档

### Requirement: Verification precedes completion claims

Agent SHALL 在声明完成、通过或修复前运行最新验证命令，并报告实际结果与未覆盖项。

#### Scenario: Agent reports passing checks
- **WHEN** Agent 声称类型检查、测试或构建通过
- **THEN** Agent MUST 在同一轮工作中运行对应完整命令并引用实际输出

#### Scenario: Verification cannot run
- **WHEN** 环境缺少所需命令或服务
- **THEN** Agent MUST 明确报告阻塞原因，不得推断为通过
