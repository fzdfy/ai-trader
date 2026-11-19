# Spec Delta

## Purpose

为需要人工判断的数据治理事件提供最小可复用的 Work Task 记录，使来源标准升级和数据事故能够进入明确的责任处理流程。

## ADDED Requirements

### Requirement: Governance events can create review work

系统 SHALL 为来源标准版本变化和需要人工确认的数据治理事件创建 Work Task。

#### Scenario: A source standard changes
- **WHEN** 来源标准巡检发现版本或 checksum 变化
- **THEN** 系统 MUST 创建一条待处理的治理审阅 Work Task

### Requirement: Review tasks retain governance context

治理审阅 Work Task SHALL 保存任务类型、标题、状态、优先级、责任角色、关联来源标准、关联数据事故和创建来源。

#### Scenario: A reviewer opens a generated task
- **WHEN** Data Steward 查看来源标准升级任务
- **THEN** 任务 MUST 显示当前固定版本、检测到的新版本和受影响的 Provider 能力

### Requirement: Review task lifecycle is traceable

治理审阅 Work Task SHALL 支持待处理、处理中、已完成和已取消状态，并记录状态变化时间与处理结果。

#### Scenario: A review task is completed
- **WHEN** 处理者完成兼容性评审
- **THEN** 系统 MUST 保存处理结论和完成时间，不得覆盖创建时的治理上下文

### Requirement: Governance tasks do not replace OpenSpec changes

完成治理审阅 Work Task MUST NOT 直接修改生产代码或来源配置；需要代码变化时 SHALL 转入 OpenSpec 变更。

#### Scenario: Review concludes a breaking change
- **WHEN** 审阅结果确认来源标准存在破坏性变化
- **THEN** 系统 MUST 要求创建 OpenSpec 变更后才能实施生产修改
