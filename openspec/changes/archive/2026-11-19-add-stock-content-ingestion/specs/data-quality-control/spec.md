# Spec Delta

## ADDED Requirements

### Requirement: Stock content has Tier 1 quality checks

新闻、公告和研报 SHALL 使用版本化 Tier 1 质量规则检查新鲜度、必填字段、唯一性、个股关联覆盖和研报文档提取状态。

#### Scenario: News has no linked symbols
- **WHEN** 新闻文章存在但个股关联覆盖率为零
- **THEN** 系统 MUST 记录 warning，而 MUST NOT 阻断研究任务

#### Scenario: Required content fields are missing
- **WHEN** 新闻、公告或研报缺少标题、来源、时间或业务唯一键
- **THEN** 系统 MUST 保存失败或警告质量和检查时间

#### Scenario: Research PDF extraction is incomplete
- **WHEN** 研报有 PDF 但文档尚未提取或提取失败
- **THEN** 系统 MUST 产生 Tier 1 warning 并保留研报元数据

### Requirement: Stock content checks preserve execution context

内容质量结果 SHALL 保存资产、规则版本、严重度、检查时间、任务标识和实际指标。

#### Scenario: Scheduled content sync completes
- **WHEN** 新闻、公告或研报同步成功
- **THEN** 相关质量结果 MUST 可在治理页面按资产追溯
