# Spec Delta

## MODIFIED Requirements

### Requirement: Task page exposes loading empty error and partial states

工作任务页面 SHALL 在桌面和移动端、浅色和深色主题中展示可理解且可恢复的状态，并与确认视觉基准保持一致。

#### Scenario: Some task writes fail
- **WHEN** 一个乐观更新失败而其他任务保持成功
- **THEN** 页面 MUST 只回滚失败项并保留其他成功结果

#### Scenario: A view has no tasks
- **WHEN** 用户进入没有任务的今日、收件箱、未来或全部视图
- **THEN** 页面 MUST 显示对应空态和下一步操作

#### Scenario: A user changes work-task views
- **WHEN** 用户切换今日、收件箱、未来或全部视图
- **THEN** 当前 Tab MUST 使用品牌蓝选中态，未选 Tab MUST 使用次级文字与主色 Hover

#### Scenario: A user enters the work-task page
- **WHEN** 工作任务页渲染看板和任务卡
- **THEN** 页面 MUST 使用统一画布、面板、边框和文字 token，不得增加与确认原型不一致的额外表面层级
