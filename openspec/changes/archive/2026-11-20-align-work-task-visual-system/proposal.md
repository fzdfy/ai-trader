# Proposal

## Why

已上线的工作任务页沿用了旧探索稿中的黑色 Tab 和多层表面，助手侧栏在部分路径下仍固定为另一套颜色，与已确认的 V2 视觉基准不一致。需要把视觉定稿与生产页面同步，并明确默认主题行为。

## What Changes

- 将 `docs/design/prototypes/initial/quant-workbench-user-work-task-v1.html` 作为个人工作任务的正式视觉基准。
- 工作任务视图 Tab 在浅色和深色主题中统一使用品牌蓝选中态。
- 首次进入默认使用浅色主题；只有用户选择“跟随系统”时才读取系统偏好。
- 工作任务页移除多余看板容器，压缩侧栏菜单并统一任务卡层级。
- 助手侧栏使用当前应用语义表面，不再在深色页面中显示固定白色面板。
- 不修改任务接口、数据库结构、权限和任务生命周期。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `preline-workbench-ui`: 明确默认浅色模式、工作台语义表面和助手侧栏随主题切换。
- `user-work-task`: 明确工作任务页、视图 Tab 和任务卡的确认视觉基准。

## Impact

- `apps/web`：默认主题初始化、工作任务页面、看板、侧栏、助手侧栏和通用输入框样式。
- 设计资产：新增已确认的个人工作任务基准稿与生产验收截图。
- API、数据库、Worker 和任务数据不变。

## Visual Design Impact

Visual design: required.

参考原型为 `docs/design/prototypes/initial/quant-workbench-user-work-task-v1.html`。已覆盖桌面/移动端、浅色/深色、工作任务看板与助手侧栏，并经用户确认。
