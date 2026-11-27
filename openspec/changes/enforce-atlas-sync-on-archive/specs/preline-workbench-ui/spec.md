# Spec Delta

## ADDED Requirements

### Requirement: Accepted visual changes enter the current design Atlas at archive

用户确认并最终落地的视觉版本 SHALL 在变更归档时成为可发现的当前设计基线，同时继续保留原探索稿和历史版本。

#### Scenario: A confirmed prototype is implemented and archived

- **WHEN** 用户已确认视觉方向、实现截图已通过验收且对应 change 获准归档
- **THEN** 最终原型 MUST 保存为 `initial/` 下的当前基准
- **AND** Atlas MUST 新增或更新对应页面条目
- **AND** 条目 MUST 关联 change 名称、最终基准稿和关键状态截图或截图索引
- **AND** 原始 `explorations/` 稿 MUST 继续保留

#### Scenario: The Atlas entry is verified

- **WHEN** Agent 完成 Atlas 回写
- **THEN** Agent MUST 从 Atlas 单入口打开对应条目并验证最终基准和截图链接可用
- **AND** 浏览器验证结果 MUST 进入 `verification.md`
