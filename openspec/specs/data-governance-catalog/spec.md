# data-governance-catalog Specification

## Purpose

建立覆盖全部生产数据资产的治理目录，使数据域、责任、等级、契约、血缘和生命周期边界可追溯且不会与仓库实现漂移。

## Requirements

### Requirement: Governance metadata is code-defined

系统 SHALL 以仓库代码注册表作为数据域、责任角色、资产等级、契约、SLA、质量规则和血缘的静态事实源。

#### Scenario: A governance asset is resolved
- **WHEN** 系统读取任一治理资产
- **THEN** 资产定义 MUST 来自版本受控的代码注册表，而不是可编辑的数据库元数据

### Requirement: All production assets have governance ownership

系统 SHALL 为每张生产数据表和视图记录数据域、Data Owner、Data Steward、Data Operator、Tier、分类、消费边界和保留期限。

#### Scenario: An asset lacks required governance fields
- **WHEN** 注册表包含缺失必填治理字段的生产资产
- **THEN** 校验 MUST 失败并标明缺失字段

### Requirement: Tier 0 assets have explicit data contracts

Tier 0 数据资产 SHALL 定义来源、粒度、主键、时间口径、允许空值、质量边界、SLA 和允许的消费方式。

#### Scenario: A Tier 0 asset uses PIT data
- **WHEN** 资产契约声明时点一致性要求
- **THEN** 契约 MUST 明确可用时间字段和禁止未来数据泄漏的规则

### Requirement: Asset lineage is declared

系统 SHALL 从数据资产追溯到上游来源标准、Provider 能力、同步任务、上游资产和下游消费方。

#### Scenario: A research result is investigated
- **WHEN** 用户查看依赖某个数据资产的研究结果
- **THEN** 系统 MUST 返回该资产的上游同步链路和受影响的下游资产

### Requirement: Governance documentation is generated

治理目录文档 SHALL 从代码注册表生成，不得依赖手工维护的第二份资产目录。

#### Scenario: Registry and documentation disagree
- **WHEN** 生成文档与代码注册表不一致
- **THEN** 校验 MUST 失败并报告差异

### Requirement: New assets require governance metadata

新增或修改生产数据资产 SHALL 在同一变更中补齐治理元数据、契约和血缘。

#### Scenario: A new data table is introduced
- **WHEN** 变更新增生产数据表
- **THEN** 变更 MUST 同时提供数据域、责任角色、Tier、分类、保留期限和上下游关系
