# Spec Delta

## Purpose

以可验证的原型、Preline 组件和统一主题构建量化 AI 工作台界面，同时保留历史原型并支持渐进迁移。

## ADDED Requirements

### Requirement: Original prototypes remain reproducible

项目 SHALL 将确认过的原型基准稿和探索稿分开保存，任何重设计不得直接覆盖原稿。

#### Scenario: A prototype is redesigned
- **WHEN** 设计师或 Agent 开始重设计探索
- **THEN** 系统 MUST 保留原始 HTML 或截图，并在 `docs/design/prototypes/explorations/` 创建独立副本

#### Scenario: A prototype is accepted
- **WHEN** 新原型经视觉与交互确认
- **THEN** 基准原型 MUST 单独更新，探索稿 MUST 继续保留

### Requirement: UI uses a semantic Preline theme

产品界面 SHALL 使用 Preline 语义 CSS 变量和 Tailwind 工具类表达颜色、表面、边框、排版、间距、圆角与阴影。

#### Scenario: A component uses color
- **WHEN** 页面定义背景、文本、边框或状态颜色
- **THEN** 组件 MUST 使用语义 token 或项目语义工具类，不得散落 raw hex

#### Scenario: Theme modes switch
- **WHEN** 用户在浅色和深色模式之间切换
- **THEN** 页面、导航、卡片、表单和图表 MUST 同步更新且保存用户选择

### Requirement: Workbench shell and landing page use Preline

全局导航、认证页和量化工作台首页 SHALL 使用 Preline + Tailwind 实现，并保持现有路由与数据行为。

#### Scenario: A signed-in user opens the workbench
- **WHEN** 用户进入 `/home`
- **THEN** 系统 MUST 展示 Preline 导航、左侧功能菜单、工作台指标、任务、行情摘要和右侧 AI 助手区域

#### Scenario: A route changes
- **WHEN** 用户在 Preline 页面之间导航
- **THEN** 需要交互插件的 Preline 组件 MUST 在新页面挂载后重新初始化，并在卸载时清理

### Requirement: UI remains accessible and responsive

工作台 SHALL 支持键盘导航、清晰焦点、语义化结构、窄屏布局和 reduced motion。

#### Scenario: User navigates with keyboard
- **WHEN** 用户使用 Tab 和 Enter 操作导航、菜单或按钮
- **THEN** 所有交互 MUST 可见聚焦并触发预期行为

#### Scenario: Screen width is mobile
- **WHEN** 视口宽度进入移动端范围
- **THEN** 三列工作台 MUST 收敛为可用的单列或抽屉布局，不得出现不可访问的水平溢出

### Requirement: Legacy pages migrate incrementally

在存在多套 UI 依赖的过渡期，迁移 SHALL 按路由清单逐步完成，并持续保持应用可运行。

#### Scenario: Only the workbench shell is migrated
- **WHEN** 其他业务页仍依赖旧组件库
- **THEN** 新旧界面 MUST 共享同一全局主题、认证和路由行为，且任务清单 MUST 明确剩余待迁移页面
