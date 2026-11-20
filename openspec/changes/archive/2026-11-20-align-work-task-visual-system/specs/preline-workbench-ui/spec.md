# Spec Delta

## MODIFIED Requirements

### Requirement: UI uses a semantic Preline theme

产品界面 SHALL 使用 Preline 语义 CSS 变量和 Tailwind 工具类表达颜色、表面、边框、排版、间距、圆角与阴影。

#### Scenario: A component uses color
- **WHEN** 页面定义背景、文本、边框或状态颜色
- **THEN** 组件 MUST 使用语义 token 或项目语义工具类，不得散落 raw hex

#### Scenario: Theme modes switch
- **WHEN** 用户在浅色和深色模式之间切换
- **THEN** 页面、导航、卡片、表单和助手侧栏 MUST 同步更新且保存用户选择

#### Scenario: A user opens the app for the first time
- **WHEN** 用户本地没有保存主题偏好
- **THEN** 应用 MUST 使用与确认原型一致的浅色主题

#### Scenario: A user chooses system mode
- **WHEN** 用户明确选择“跟随系统”
- **THEN** 应用 MUST 根据操作系统偏好决定浅色或深色
