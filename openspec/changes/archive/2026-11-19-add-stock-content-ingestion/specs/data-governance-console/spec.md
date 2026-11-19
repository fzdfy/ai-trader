# Spec Delta

## ADDED Requirements

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
