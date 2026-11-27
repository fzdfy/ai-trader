# Spec Delta

## MODIFIED Requirements

### Requirement: Development workflow routes each phase to the correct capability

项目 SHALL 按变更类型、风险等级、L2 保证档位和已确认基线路由 v3 的规划、实施、验证与归档流程，并只加载当前步骤需要的 Skill。

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
- **THEN** 变更 MUST 按 L2 处理并完成完整技术设计
- **AND** 认证、权限、数据、PIT、回测、迁移和跨服务边界 MUST NOT 因选择 `assurance: bounded` 降为 L1

#### Scenario: A bounded L2 change starts implementation

- **WHEN** L2 变更同时满足以下五项条件：影响局限在一个可独立部署的服务、Provider 适配器或部署配置边界；不改变数据库 schema、数据语义、PIT、复权或回测口径；不改变权限模型、公共 API 或跨服务契约；可通过回滚代码或配置恢复，无需数据修复、重放或人工迁移；现有测试和验证能够覆盖改动边界
- **THEN** 变更 MAY 使用 `assurance: bounded`
- **AND** 用户规划确认后可以直接进入实施，不要求实施前的独立设计评审
- **AND** 实施完成后 MUST 先完成独立代码与风险评审，再修复 findings 并运行最新完整验证
- **AND** `changes-required` 清零且最新验证完成后 MUST 才可请求用户验收

#### Scenario: A systemic L2 change starts implementation

- **WHEN** L2 变更对五项 bounded 条件中的任一项不满足，或分类存在争议
- **THEN** 变更 MUST 使用 `assurance: systemic`
- **AND** 实施前 MUST 完成独立设计评审，实施后 MUST 完成独立代码与风险评审
- **AND** 任一评审存在未清零的 `changes-required` 时 MUST NOT 进入下一阶段

#### Scenario: Implementation starts

- **WHEN** OpenSpec 规划产物已就绪且用户授权实施
- **THEN** Agent MUST 以 `tasks.md` 作为唯一实施进度清单
- **AND** 行为代码 MUST 按 TDD 先取得失败测试证据

#### Scenario: Implementation is complete

- **WHEN** 任务清单全部实施完成
- **THEN** Agent MUST 先完成对应保证档位要求的代码与风险评审并处理 findings
- **AND** 评审后的实现 MUST 重新运行最新完整验证，且形成与最新命令一致的验证证据
- **AND** `changes-required` 未清零时 MUST NOT 请求用户验收

### Requirement: Each change has complete planning artifacts

OpenSpec 变更 SHALL 保留 proposal、能力增量、design、tasks 与验证结果。L2 MUST 在分类时初选保证档位，由完整设计确认；档位变化 MUST 触发硬停、重新分类和用户确认。

#### Scenario: A change is proposed

- **WHEN** 创建新的 OpenSpec 变更
- **THEN** 变更 MUST 声明 `type`、`risk`、`baseline` 和视觉影响
- **AND** `risk: L2` 的变更 MUST 在分类阶段额外初选 `assurance: bounded | systemic`
- **AND** 变更 MUST 包含 proposal、适用能力增量、design 和非空 tasks

#### Scenario: A standard change has no new technical decision

- **WHEN** L1 变更没有需要比较的技术方案
- **THEN** `design.md` MUST 明确记录“无新增技术决策”
- **AND** `design.md` MUST NOT 复制 proposal 的目标、非目标和验收标准

#### Scenario: A high-risk change is reviewed

- **WHEN** L2 变更完成实施前设计
- **THEN** `design.md` MUST 包含替代方案、失败模式、兼容性和回滚方式
- **AND** 变更 MUST 按 `assurance` 档位执行对应的实施前和实施后评审
- **AND** 任一阶段的 `changes-required` 未清零时 MUST NOT 进入用户验收

#### Scenario: A bounded high-risk change is reviewed

- **WHEN** L2 变更被判定为 `assurance: bounded`
- **THEN** `design.md` MUST 包含替代方案、失败模式、兼容性和回滚方式
- **AND** 实施前 MUST NOT 要求独立设计评审
- **AND** 实施后 MUST 在 `verification.md` 记录独立代码与风险评审的评审者、日期、结论和 findings 处理结果
- **AND** 评审修复后 MUST 重新运行最新完整验证

#### Scenario: A systemic high-risk change is reviewed

- **WHEN** L2 变更被判定为 `assurance: systemic`
- **THEN** `design.md` MUST 包含替代方案、失败模式、兼容性和回滚方式
- **AND** `design.md` 的 `Review Result` MUST 记录实施前独立设计评审的评审者、日期和批准状态
- **AND** 实施后 MUST 在 `verification.md` 记录独立代码与风险评审结论
- **AND** 评审修复后 MUST 重新运行最新完整验证

#### Scenario: An L2 assurance level changes after design

- **WHEN** 完整设计或实施发现五项 bounded 条件不再全部成立
- **THEN** Agent MUST 停止当前实施
- **AND** 变更 MUST 升级为 `assurance: systemic`
- **AND** Agent MUST 完成或补充实施前独立设计评审并重新取得用户规划确认

#### Scenario: A systemic L2 assurance level cannot be downgraded after implementation

- **WHEN** 实施已经开始且变更被标记为 `assurance: systemic`
- **THEN** 变更 MUST NOT 降为 `assurance: bounded`

#### Scenario: A systemic L2 assurance level is downgraded before implementation

- **WHEN** 实施尚未开始且 `assurance: systemic` 重新满足五项 bounded 条件
- **THEN** Agent MUST 停止规划、重新确认五项条件并取得用户确认

#### Scenario: A task is completed

- **WHEN** Agent 将任务标记完成
- **THEN** 对应失败测试、GREEN 结果或静态检查证据 MUST 记录在任务或测试报告中
- **AND** Agent MUST NOT 仅凭代码已修改判断完成

### Requirement: SDD versions preserve complete workflow baselines

项目 SHALL 在 `docs/standards/sdd/` 保存版本化 SDD 基线，将 v1 和 v2 标记为历史流程、v3 标记为当前流程，并提供相邻版本的迁移记录。

#### Scenario: Maintainer inspects an SDD version

- **WHEN** 维护者打开 `docs/standards/sdd/v1.md`、`v2.md` 或 `v3.md`
- **THEN** 文档 MUST 说明该版本的流程设计、阶段、产物、确认方式和完成条件
- **AND** 文档 MUST 列出该版本使用的 Skill、职责、输入、输出和使用阶段

#### Scenario: Agent resolves the current workflow

- **WHEN** Agent 开始新的非平凡变更
- **THEN** `docs/standards/sdd/README.md` MUST 将 v3 标识为当前版本
- **AND** Agent MUST 只把 v1 和 v2 作为历史、审计或迁移参考

#### Scenario: Maintainer understands v1 to v2 migration

- **WHEN** 维护者需要比较 v1 与 v2
- **THEN** `docs/standards/sdd/v1-to-v2.md` MUST 说明原因、保留项、移除项、文件映射、确认变化、回滚方式和历史兼容策略

#### Scenario: Maintainer understands v2 to v3 migration

- **WHEN** 维护者需要比较 v2 与 v3
- **THEN** `docs/standards/sdd/v2-to-v3.md` MUST 说明 L2 保证档位、评审时机、兼容策略和回滚方式

### Requirement: Change type and risk determine evidence

每个 v3 变更 SHALL 声明变更类型、风险等级和期望基线；L2 MUST 再声明保证档位，并据此决定独立设计评审是否存在实施前门禁。

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

#### Scenario: A bounded L2 assurance level is selected

- **WHEN** L2 变更在分类阶段同时满足以下五项条件：影响局限在一个可独立部署的服务、Provider 适配器或部署配置边界；不改变数据库 schema、数据语义、PIT、复权或回测口径；不改变权限模型、公共 API 或跨服务契约；可通过回滚代码或配置恢复，无需数据修复、重放或人工迁移；现有测试和验证能够覆盖改动边界
- **THEN** 变更 MAY 使用 `assurance: bounded`
- **AND** 完成证据 MUST 包含实施后独立代码与风险评审
- **AND** 逐项条件 MUST 在完整设计中复核

#### Scenario: A systemic L2 assurance level is selected

- **WHEN** L2 变更对五项 bounded 条件中的任一项不满足，或分类存在争议
- **THEN** 变更 MUST 使用 `assurance: systemic`
- **AND** 完成证据 MUST 包含实施前独立设计评审和实施后独立代码与风险评审

#### Scenario: Risk overrides change type

- **WHEN** 小型 bug 或 UI 修改涉及认证、安全、数据迁移、数据源、PIT 或回测口径
- **THEN** 变更 MUST 按 L2 执行
- **AND** 变更类型 MUST NOT 被用于降低验证要求
