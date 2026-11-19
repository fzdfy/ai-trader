# Spec Delta

## Purpose

在现有数据管理中提供超级管理员可见的治理运营视图，把资产、契约、质量、来源版本和事故组织为可追溯的操作页面。

## ADDED Requirements

### Requirement: Governance is embedded in data management

超级管理员 SHALL 从现有数据管理区域进入治理视图，不新增独立后台应用或顶层业务菜单。

#### Scenario: A super administrator opens governance
- **WHEN** 用户进入数据管理并选择治理入口
- **THEN** 系统 MUST 显示治理总览和资产、质量、来源版本、事故等子入口

### Requirement: Governance assets expose ownership and contracts

治理资产页面 SHALL 显示数据域、责任角色、Tier、分类、契约、SLA、来源标准、上下游和最近质量状态。

#### Scenario: An asset is inspected
- **WHEN** 超级管理员打开一个数据资产
- **THEN** 页面 MUST 显示其责任角色、契约摘要、来源版本、血缘和最新质量证据

### Requirement: Static governance metadata is read-only

治理控制台 MUST NOT 提供在线修改代码注册表中的数据域、Owner、契约、SLA、质量规则或来源标准的功能。

#### Scenario: A user attempts to edit static metadata
- **WHEN** 超级管理员查看资产或契约详情
- **THEN** 页面 MUST 只提供只读展示和变更说明，不提供直接编辑入口

### Requirement: Governance details are restricted

普通用户 MUST NOT 通过页面、直接 URL 或 API 获取资产目录、来源标准版本、质量结果、血缘或数据事故详情。

#### Scenario: A normal user calls a governance API
- **WHEN** 已登录普通用户请求治理详情 API
- **THEN** 服务端 MUST 返回 `403` 且响应不得包含敏感治理字段

### Requirement: Governance status is traceable

治理页面 SHALL 将质量异常、来源标准变化和数据事故关联到责任角色、同步任务和处理历史。

#### Scenario: A quality incident is investigated
- **WHEN** 超级管理员打开一条数据事故
- **THEN** 系统 MUST 显示受影响资产、触发规则、任务标识、责任人和状态变化
