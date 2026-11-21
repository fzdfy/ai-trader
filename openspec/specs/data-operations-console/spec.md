# data-operations-console Specification

## Purpose

为超级管理员提供统一的数据工程观察与受控操作界面，把数据来源、表、同步依赖、数据质量、故障状态和运维动作组织为可追溯的管理链路。

## Requirements

### Requirement: Data management is a unified super-admin area

系统 SHALL 在工作台内提供单一的“数据管理”入口，包含数据源、数据表、数据同步、数据质量和操作审计。

#### Scenario: A super administrator enters data management

- **WHEN** `super_admin` 从系统入口进入“数据管理”
- **THEN** 系统 MUST 显示数据源、数据表、数据同步、数据质量和操作审计入口
- **AND** 现有同步中心与数据中心 MUST 保留为同一信息架构下的子页面

### Requirement: Data source registry is source-of-truth driven

数据源配置 SHALL 以代码注册表和环境变量为事实源，管理界面只读展示代码配置并叠加运行时状态。

#### Scenario: A super administrator views a source

- **WHEN** 用户查看某个 Provider
- **THEN** 页面 MUST 显示能力、上游接口、限流规则、降级链、熔断状态和最近健康时间
- **AND** 页面 MUST NOT 允许在线修改 Provider 凭据、上游地址或限流参数

### Requirement: Data table catalog explains data lineage

每张已登记数据表 SHALL 提供用途、粒度、主键、字段、来源、同步任务、依赖、最新数据时间和运行记录。

#### Scenario: A super administrator opens a table

- **WHEN** 用户选择一张数据表
- **THEN** 页面 MUST 显示 Schema、数据来源、同步策略、回补方式、降级链、风控说明和最近任务
- **AND** 页面 MUST NOT 返回业务原始数据行或提供任意 SQL 输入

#### Scenario: A table is stale or empty

- **WHEN** 表的最新业务时间超过预期或没有数据
- **THEN** 页面 MUST 显示陈旧或空数据状态
- **AND** 不得把最近写入时间描述为业务数据日期

### Requirement: Sync operations expose dependencies and recovery paths

同步模块 SHALL 展示调度、依赖、幂等、重试、Deadline、回补和最近运行结果。

#### Scenario: A dependency fails

- **WHEN** 上游同步模块失败
- **THEN** 页面 MUST 标明受影响的下游模块
- **AND** 下游模块 MUST NOT 被显示为正常完成

#### Scenario: A module is running

- **WHEN** 同步任务正在执行
- **THEN** 页面 MUST 显示运行状态、已处理量、总量和最近更新时间

### Requirement: Data quality is visible by source and table

数据管理 SHALL 汇总完整性、新鲜度、覆盖率和失败状态，并区分真实数据与同步缺失。

#### Scenario: A data source is degraded

- **WHEN** 降级链已从主源切换或 Provider 熔断
- **THEN** 页面 MUST 显示当前生效源、降级原因和恢复状态

#### Scenario: A data gap exists

- **WHEN** 存在未解决的数据缺口
- **THEN** 页面 MUST 显示缺口范围、检测时间、影响表和当前处理状态

### Requirement: First-phase operations are limited and auditable

一期 SHALL 只允许手动同步和单模块失败重试；任何写操作都必须二次确认、限制范围并记录审计。

#### Scenario: A super administrator triggers manual sync

- **WHEN** 用户确认触发手动同步
- **THEN** 系统 MUST 记录操作者、触发时间、范围、参数和任务 ID
- **AND** 系统 MUST 继续执行现有防重入和并发锁规则

#### Scenario: A super administrator retries a failed module

- **WHEN** 用户对失败模块执行重试
- **THEN** 系统 MUST 校验模块存在且允许重试
- **AND** 系统 MUST 记录重试原因、原任务 ID 和新任务 ID

#### Scenario: A high-risk operation is requested

- **WHEN** 用户请求历史回补、派生数据重建、暂停调度、删除任务或任意 SQL
- **THEN** 一期系统 MUST 拒绝该操作

### Requirement: Administrative actions have an audit trail

系统 SHALL 保存所有数据管理写操作的不可变审计记录。

#### Scenario: An action succeeds or fails

- **WHEN** 手动同步或重试执行结束
- **THEN** 审计记录 MUST 更新为成功或失败
- **AND** 失败记录 MUST 包含可读错误和对应任务 ID
