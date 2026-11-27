# Spec Delta

## ADDED Requirements

### Requirement: Visible changes synchronize the final design to Atlas before archive

有视觉影响且已经完成实现的变更 SHALL 在归档前将用户验收的最终设计提升为基准、更新 Atlas，并记录验证证据；缺少同步证据时 MUST NOT 归档。

#### Scenario: A visual change is ready to archive

- **WHEN** 变更的 `visual` 为 `regression` 或 `new-design`，且用户已验收实现
- **THEN** Agent MUST 将最终确认稿提升到 `docs/design/prototypes/initial/`
- **AND** Agent MUST 更新 `docs/design/prototypes/atlas/index.html` 中对应页面、来源变更和截图入口
- **AND** Agent MUST 在 `verification.md` 记录 Atlas 条目、基准路径、截图索引和真实浏览器验证结果

#### Scenario: Atlas evidence is missing

- **WHEN** 有视觉影响的变更缺少最终基准、Atlas 条目或 Atlas 验证证据
- **THEN** Agent MUST 停止归档并说明缺失项
- **AND** 用户确认归档 MUST NOT 替代缺失的视觉同步

#### Scenario: A change has no visual impact

- **WHEN** 变更的 `visual` 为 `not-applicable`
- **THEN** 变更 MAY 不更新 Atlas
- **AND** proposal MUST 明确说明没有可见 UI 影响的理由
