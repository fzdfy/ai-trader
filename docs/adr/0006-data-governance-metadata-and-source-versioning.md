# Data governance metadata is code and source standards are pinned

## Status

accepted

## Context

数据源、表、同步依赖和质量规则已经部分存在于代码与文档中，但责任人、数据等级、契约、版本和运行证据没有形成统一治理链路。外部来源规范如 `a-stock-data` 还会持续升级，不能让 Skill 更新直接改变生产行为。

## Decision

静态治理元数据以代码注册表为事实源，包括数据域、Owner、Steward、Tier、契约、SLA、质量规则、血缘和来源标准版本；数据库只保存质量结果、事故、告警、版本事件和操作审计。

`a-stock-data` 按不可变版本、来源和 checksum 固定。生产取数仍以仓库 Provider 和注册表为执行事实源，不直接依赖 Skill 运行。系统 Worker 定时检测新版本并创建 Work Task；兼容性分析通过后，生产升级必须走 OpenSpec，不使用产品 Workflow 承担平台治理。

Tier 0 数据出现严重质量问题时，阻断新的回测和个股分析；Tier 1 告警；Tier 2 记录。

## Consequences

治理目录与代码保持同步，运行证据可审计且不会形成第二套可编辑元数据。代价是需要维护来源标准快照、契约测试和升级评审；外部 Skill 更新不会自动生效，但升级过程可比较、可回滚。
