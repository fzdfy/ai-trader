# data-quality-control Specification

## Purpose

把数据质量从一次性状态摘要提升为可执行规则、可追溯结果和可验证门禁，防止不可信数据进入研究结论。

## Requirements

### Requirement: Quality rules are executable and versioned

系统 SHALL 使用版本受控的规则定义完整性、唯一性、有效性、一致性、新鲜度、覆盖率和时点正确性检查。

#### Scenario: A quality rule changes
- **WHEN** 规则逻辑或阈值发生变化
- **THEN** 新旧规则版本 MUST 可区分，历史结果 MUST 保留原始规则版本

### Requirement: Quality results persist execution evidence

系统 SHALL 在相关同步或治理任务完成后记录每次质量检查的资产、规则版本、结果、指标、严重度、任务标识和执行时间。

#### Scenario: A quality rule fails
- **WHEN** 一条质量规则未通过
- **THEN** 系统 MUST 保存失败证据并关联触发它的同步任务或治理任务

### Requirement: Tier 0 failures block dependent research

当 Tier 0 资产存在严重未解决质量事故时，系统 SHALL 阻止新的回测、选股和个股分析，并返回最后可信时间和阻断原因。

#### Scenario: Backtest uses an unhealthy Tier 0 asset
- **WHEN** 用户发起依赖该资产的新回测
- **THEN** 系统 MUST 拒绝启动并说明受影响资产和最后可信时间

### Requirement: Lower tiers degrade without blocking

Tier 1 质量问题 SHALL 产生显著警告，Tier 2 质量问题 SHALL 记录但不阻止研究任务。

#### Scenario: Tier 1 data is stale
- **WHEN** Tier 1 资产超过其契约 SLA
- **THEN** 研究结果 MUST 显示警告，但任务 MAY 继续运行

### Requirement: Data incidents have a controlled lifecycle

系统 SHALL 支持数据事故从开放、确认、处理中到解决或关闭的状态流转，并记录影响资产、严重度、责任人、根因和恢复时间。

#### Scenario: A critical quality failure occurs
- **WHEN** 严重质量规则持续失败
- **THEN** 系统 MUST 创建或关联一条可追踪的数据事故

### Requirement: Quality evidence is append-only

质量结果和数据事故状态变化 SHALL 通过追加或受控状态收敛保留历史，不得从管理界面静默删除。

#### Scenario: An incident is resolved
- **WHEN** 操作者将事故标记为已解决
- **THEN** 系统 MUST 保留原事故、状态变化、操作者、原因和时间
