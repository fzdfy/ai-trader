# Spec Delta

## Purpose

提供可理解、可键盘操作的工作流列表、DAG 画布、节点配置和运行详情，并在工作台展示今日实际运行摘要。

## ADDED Requirements

### Requirement: Workflow list exposes configuration and latest run

工作流页面 SHALL 以行式列表展示用户工作流的名称、触发器、状态、最近运行和可用操作。

#### Scenario: User views workflows
- **WHEN** 用户进入 `/home/workflows`
- **THEN** 系统 MUST 展示活动工作流和最近运行状态
- **AND** 已归档工作流 MUST 不再出现在默认列表

#### Scenario: User creates a workflow
- **WHEN** 用户点击“新建工作流”
- **THEN** 系统 MUST 打开空白画布并创建可保存的草稿

#### Scenario: User archives a workflow
- **WHEN** 用户确认删除工作流
- **THEN** 系统 MUST 归档工作流并从活动列表移除

### Requirement: Canvas supports directed workflow editing

工作流画布 SHALL 支持节点面板、拖拽、连线、删除、缩放、适配画布、配置抽屉和撤销/重做。

#### Scenario: User adds and connects nodes
- **WHEN** 用户从节点面板添加动作并连接合法端口
- **THEN** 系统 MUST 在画布中保留节点位置和连线

#### Scenario: User makes an accidental edit
- **WHEN** 用户删除节点或连线后执行撤销
- **THEN** 系统 MUST 恢复最近一次图编辑

#### Scenario: User edits node configuration
- **WHEN** 用户选择节点
- **THEN** 系统 MUST 打开该节点的参数配置抽屉

### Requirement: Graph editing remains usable without a mouse

工作流画布 SHALL 提供键盘可达的节点选择、配置、删除和发布操作，并保持可见焦点。

#### Scenario: Keyboard user navigates the editor
- **WHEN** 用户使用 Tab、Enter、Escape 和方向操作浏览编辑器
- **THEN** 用户 MUST 能选择节点、打开配置、关闭抽屉并触发发布

#### Scenario: Viewport is narrow
- **WHEN** 用户在移动端打开工作流编辑器
- **THEN** 系统 MUST 提供可用降级布局，不得要求水平滚动整个页面

### Requirement: Publishing surfaces validation errors

编辑器 SHALL 在发布前校验图结构并展示具体、可定位的错误。

#### Scenario: Validation fails
- **WHEN** 图缺少触发器、存在循环或孤立节点
- **THEN** 系统 MUST 阻止发布并指出节点或连线

#### Scenario: User saves an unpublished draft
- **WHEN** 当前图尚未通过发布校验
- **THEN** 系统 MUST 允许保存草稿但不得启动调度

### Requirement: Run detail shows node timeline

运行详情 SHALL 展示版本、触发器、整体状态、当前节点和逐节点状态时间线。

#### Scenario: User views a completed run
- **WHEN** 用户打开已完成的运行
- **THEN** 系统 MUST 展示每个节点的耗时、状态和摘要结果

#### Scenario: User views a failed run
- **WHEN** 用户打开失败的运行
- **THEN** 系统 MUST 标出失败节点、错误信息和未执行的下游节点

#### Scenario: User cancels a run
- **WHEN** 创建者取消活动运行
- **THEN** 界面 MUST 明确提示在途步骤可能完成但后续节点不会开始

### Requirement: Workbench shows today's workflow runs

工作台 SHALL 展示当前用户今天的 Workflow Run 摘要。

#### Scenario: User has today's runs
- **WHEN** 用户进入工作台
- **THEN** “今日工作流” MUST 展示工作流名称、触发时间、当前步骤、状态和耗时

#### Scenario: User has no today's runs
- **WHEN** 当前用户今天没有工作流运行
- **THEN** 区域 MUST 显示空状态和进入工作流页面的入口
