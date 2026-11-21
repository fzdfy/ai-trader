# Spec Delta

## Purpose

让用户以可版本化、可调度和可审计的方式组合现有研究能力，形成私有 DAG 工作流并查看每次执行结果。

## ADDED Requirements

### Requirement: Workflows are private versioned resources

工作流 SHALL 仅对创建者可见、可编辑和可运行，并通过不可变发布版本执行。

#### Scenario: User creates and publishes a workflow
- **WHEN** 用户保存草稿并发布工作流
- **THEN** 系统 MUST 创建新的不可变版本，并将该版本设为当前运行版本

#### Scenario: User edits a published workflow
- **WHEN** 用户修改已发布工作流
- **THEN** 系统 MUST 保留当前发布版本，直到用户再次发布新版本

#### Scenario: Other users access a workflow
- **WHEN** 非创建者请求工作流定义或运行记录
- **THEN** 系统 MUST 拒绝访问

### Requirement: Workflow definitions use a validated DAG

发布版本 SHALL 是只有一个触发器、无循环、所有动作节点可达且连线类型合法的有向无环图。

#### Scenario: User publishes a valid graph
- **WHEN** 图中恰好有一个触发器，且所有动作节点从触发器可达、不存在循环
- **THEN** 系统 MUST 允许发布

#### Scenario: User publishes an invalid graph
- **WHEN** 图存在多个触发器、循环、孤立动作节点或非法端口连接
- **THEN** 系统 MUST 阻止发布并指出具体校验错误

### Requirement: Supported triggers define when a run starts

工作流 SHALL 支持手动、交易日定时和指定同步模块完成后三种触发器。

#### Scenario: User runs manually
- **WHEN** 用户点击运行已发布工作流
- **THEN** 系统 MUST 创建一次手动触发的运行

#### Scenario: Scheduled trigger fires
- **WHEN** 当前日期是交易日、时间达到工作流配置的 `HH:mm` 且工作流已启用
- **THEN** 系统 MUST 创建一次定时触发的运行

#### Scenario: Sync completion trigger fires
- **WHEN** 工作流指定的同步模块成功完成
- **THEN** 系统 MUST 创建一次同步事件触发的运行

### Requirement: Workflow nodes use typed inputs and outputs

工作流 SHALL 支持股票池、选股、回测、复盘和 AI 因子迭代动作，并只允许声明过的类型化数据传递。

#### Scenario: Stock symbols flow into backtest
- **WHEN** 股票池或选股节点向回测节点输出 `symbols[]`
- **THEN** 回测节点 MUST 对最多 50 个标的逐只执行并汇总结果

#### Scenario: Invalid data connection is created
- **WHEN** 用户尝试把不支持的数据类型连接到动作节点端口
- **THEN** 系统 MUST 拒绝该连线

#### Scenario: Backtest limit is exceeded
- **WHEN** 回测节点收到超过 50 个标的
- **THEN** 系统 MUST 在运行前阻止执行并返回明确限制错误

### Requirement: Run execution is deterministic and serial

同一工作流 SHALL 最多有一个活动运行；节点只在全部父节点成功后执行，节点失败后下游不得执行。

#### Scenario: Trigger occurs while workflow is running
- **WHEN** 工作流已有活动运行时再次被触发
- **THEN** 系统 MUST 跳过本次触发并记录跳过原因

#### Scenario: Node fails
- **WHEN** 某个节点执行失败
- **THEN** 系统 MUST 将该节点标记为失败并停止所有下游节点

#### Scenario: Parallel branches exist
- **WHEN** 一个节点连接多个下游分支
- **THEN** 系统 MUST 在不共享可变执行状态的前提下并行调度各分支

### Requirement: Users can cancel workflow runs

用户 SHALL 能取消活动运行；取消后不得启动新的下游节点。

#### Scenario: User cancels an active run
- **WHEN** 创建者取消活动运行
- **THEN** 系统 MUST 将运行标记为已取消并阻止后续节点开始
- **AND** 已经发往外部服务的在途步骤 MAY 完成，但其结果不得继续传递

### Requirement: Workflow execution is auditable

系统 SHALL 记录工作流运行和每个节点的状态、输入摘要、输出摘要、错误和耗时。

#### Scenario: User opens a run
- **WHEN** 用户查看工作流运行详情
- **THEN** 系统 MUST 展示绑定的工作流版本、触发来源、整体状态和节点时间线

#### Scenario: Large node output is stored
- **WHEN** 节点产生大型结果
- **THEN** 系统 MUST 保存受限摘要和业务结果引用，不得无界复制完整结果

### Requirement: Workflow history is retained and archived safely

运行历史 SHALL 保留 90 天；删除工作流采用归档并保留可访问的运行历史至清理期限。

#### Scenario: User archives a workflow
- **WHEN** 用户删除工作流
- **THEN** 系统 MUST 从活动列表隐藏该工作流，并保留其历史运行

#### Scenario: History exceeds retention
- **WHEN** 运行历史超过 90 天
- **THEN** 系统维护任务 MUST 清理过期运行和节点记录
