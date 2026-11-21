# Spec Delta

## ADDED Requirements

### Requirement: System navigation is role-aware

工作台系统入口 SHALL 根据服务端返回的角色显示，不得仅依赖客户端本地状态判断权限。

#### Scenario: A super administrator opens the workbench
- **WHEN** `super_admin` 登录并进入工作台
- **THEN** 系统入口 MUST 显示“数据管理”和“主题设置”
- **AND** “同步中心”和“数据中心” MUST 作为“数据管理”的明确子页面出现

#### Scenario: A normal user opens the workbench
- **WHEN** `user` 登录并进入工作台
- **THEN** 系统入口 MUST 只显示“主题设置”
- **AND** 页面 MUST NOT 显示“数据管理”“同步中心”或“数据中心”的菜单入口

#### Scenario: An unauthorized user opens a protected URL
- **WHEN** `user` 直接访问数据管理页面
- **THEN** 页面 MUST 重定向到工作台或显示无权限状态
- **AND** 不得短暂渲染数据管理内容

#### Scenario: The role is loading
- **WHEN** 页面尚未取得当前用户角色
- **THEN** 系统 MUST 按最小权限隐藏数据管理入口

### Requirement: Role-aware navigation preserves the compact system area

系统入口 SHALL 保持紧凑布局，超级管理员通过单一“数据管理”入口访问同步中心和数据中心。

#### Scenario: Desktop navigation is rendered
- **WHEN** 系统入口显示在桌面侧栏底部
- **THEN** 入口 MUST 使用紧凑图标按钮
- **AND** “同步中心”和“数据中心” MUST NOT 作为两个重复的顶层底部入口
