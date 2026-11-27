# Spec Delta

## MODIFIED Requirements

### Requirement: Stock analysis is discoverable under market intelligence

个股分析 SHALL 保留“市场情报”下的搜索入口，并以统一股票工作台的 `mode=research` 承载单股深度研究。

#### Scenario: User finds a stock analysis

- **WHEN** 用户进入“个股分析”搜索入口
- **THEN** 系统 MUST 支持按名称或代码搜索 A 股
- **AND** 选择标的后 MUST 打开统一股票工作台的 `mode=research`

#### Scenario: User starts from market detail

- **WHEN** 用户在快速行情模式点击“深度研究”
- **THEN** 页面 MUST 在同一股票路由原地切换到 `mode=research`
- **AND** MUST NOT 导航到另一个单股详情路由
- **AND** 股票、行情和来源返回链路 MUST 保持可追溯
