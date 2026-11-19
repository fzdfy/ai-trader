# data-governance-console Specification

## Purpose

在现有数据管理中提供超级管理员可见的治理运营视图，把资产、契约、质量、来源版本和事故组织为可追溯的操作页面。

## Requirements

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

### Requirement: Stock content assets appear in data management operations

数据管理 SHALL 在数据表、数据源和数据同步页面登记新闻、公告和研报的 10 张相关表，并区分外部来源表与本地派生表。

#### Scenario: An administrator opens the data table page
- **WHEN** 超级管理员查看数据表目录
- **THEN** 页面 MUST 列出新闻、公告和研报表及其更新时间

#### Scenario: An administrator opens the data source page
- **WHEN** 超级管理员查看新闻、公告或研报来源
- **THEN** 原始表和主表 MUST 显示外部接口与降级链
- **AND** 派生表 MUST 显示生产它的上游表和任务

#### Scenario: An administrator opens data synchronization
- **WHEN** 超级管理员查看内容同步
- **THEN** 页面 MUST 显示新闻、公告和研报的定时任务、最近运行和手动刷新状态

### Requirement: Content asset quality is visible to administrators

治理与数据质量页面 SHALL 展示新闻、公告和研报的最新质量结果、个股关联覆盖和研报文档提取状态。

#### Scenario: Content quality warning exists
- **WHEN** 新闻关联覆盖不足或研报 PDF 尚未提取
- **THEN** 超级管理员 MUST 能看到对应资产、规则版本、检查时间和证据
