# 区分个人工作任务与治理审阅任务

原 `work_task` 表虽然命名通用，实际只承载来源标准变化和数据事故的治理审阅；个人“工作任务”则是用户私有的人工待办。两者在所有权、权限、生命周期、时间语义和页面归属上不同，因此决定将原表原地迁移为 `governance_review_task` / `governance_review_task_event`，并为个人任务新建 `user_work_task` / `user_work_task_event`。治理页面路由同步改为 `/home/data-management/governance/review-tasks`，个人页面继续使用 `/home/tasks`。

## Considered Options

- 复用同一张 `work_task`：字段少，但会把超级管理员治理数据和普通用户私有数据混在一起，权限与查询边界容易出错。
- 保留通用表名并增加 `task_domain`：可共用部分代码，但状态约束、完成结果和 owner 语义不同，后续条件和索引会持续分叉。
- 拆分两个领域：迁移一次命名，之后各自演进；代价是短期需要同时修改 Schema、服务、测试、路由和文档。

## Consequences

治理审阅任务继续由 Data Steward 和数据管理权限控制；个人工作任务只允许任务所有者访问。个人任务可存在收件箱、计划日期、截止时间、阻塞原因和来源快照，这些字段不会污染治理任务。未来若出现团队任务，需要另行建模成员与共享权限，不能仅通过复用治理任务表实现。
