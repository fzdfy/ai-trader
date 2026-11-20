# Spec Delta

## ADDED Requirements

### Requirement: Non-watchlist analysis triggers bounded metadata sync

非自选股首次进入分析页时，系统 SHALL 后台触发一次最近 12 个月研报元数据同步，并避免重复上游请求。

#### Scenario: First analysis of a non-watchlist symbol
- **WHEN** 非自选股在本地没有研报元数据
- **THEN** 系统 MUST 在后台触发一次最近 12 个月元数据同步
- **AND** 页面首屏 MUST NOT 等待上游同步

#### Scenario: Repeated visits within the cache window
- **WHEN** 同一非自选股在 24 小时内再次进入分析页
- **THEN** 系统 MUST 复用本地元数据或已有任务
- **AND** MUST NOT 自动重复请求上游

#### Scenario: User refreshes explicitly
- **WHEN** 用户点击“重新分析”
- **THEN** 系统 MAY 强制执行增量元数据刷新
- **AND** 全文索引 MUST 仍由独立后台任务执行
