# Spec Delta

## Purpose

建立可验证的角色与授权边界，确保数据基础设施信息和运维动作只对超级管理员开放，同时不影响普通用户使用非敏感的数据状态能力。

## ADDED Requirements

### Requirement: Users have stable application roles

系统 SHALL 为用户分配 `user` 或 `super_admin` 角色，新用户默认是 `user`，角色以数据库记录为准。

#### Scenario: A new user signs up
- **WHEN** 用户通过正常注册流程创建账户
- **THEN** 系统 MUST 将角色设为 `user`
- **AND** 客户端 MUST NOT 能自行提交或变更角色

#### Scenario: An existing user has no role
- **WHEN** 迁移前创建的账户首次进入系统
- **THEN** 系统 MUST 将其按 `user` 处理

### Requirement: First super administrator is bootstrapped securely

系统 SHALL 通过服务端 `SUPER_ADMIN_EMAILS` 白名单引导首次超级管理员，并在数据库保存最终角色。

#### Scenario: A configured email signs in
- **WHEN** 登录邮箱存在于服务端 `SUPER_ADMIN_EMAILS` 白名单
- **THEN** 系统 MUST 将该用户角色同步为 `super_admin`
- **AND** 白名单内容 MUST NOT 暴露给客户端

#### Scenario: The whitelist changes
- **WHEN** 运维移除白名单中的邮箱
- **THEN** 已存在的数据库角色 MUST NOT 被静默降级
- **AND** 角色调整 MUST 通过受审计的管理流程完成

### Requirement: Data management access is enforced server-side

系统 SHALL 同时保护数据管理页面、数据目录 API 和同步操作 API，不能只依赖前端隐藏菜单。

#### Scenario: A super administrator accesses data management
- **WHEN** `super_admin` 请求数据源、数据表、同步或质量接口
- **THEN** 服务端 MUST 允许请求

#### Scenario: A normal user calls an admin API
- **WHEN** `user` 直接请求数据管理 API
- **THEN** 服务端 MUST 返回 `403`
- **AND** 响应 MUST NOT 包含表结构、上游接口、任务错误或熔断详情

### Requirement: Public workbench status stays non-sensitive

系统 SHALL 为已登录用户提供聚合的数据新鲜度状态，同时隐藏详细基础设施信息。

#### Scenario: A normal user opens the workbench
- **WHEN** 用户进入任意工作台页面
- **THEN** 页面 MAY 显示数据在线状态、最近更新时间和同步进行中状态
- **AND** 页面 MUST NOT 展示数据源名称、表名、断档详情、任务错误或熔断状态
