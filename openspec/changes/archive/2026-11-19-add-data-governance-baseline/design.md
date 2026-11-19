# Design

## Context

现有数据管理已经具备 Provider 注册、20 张表的目录、同步依赖、基础新鲜度、断档、熔断和操作审计，但数据资产、责任、Tier、契约和质量规则仍主要散落在 `DATA_CENTER_TABLES`、文档与管道代码中。运行质量只有即时聚合，没有历史证据；`工作任务` 页面仍是占位页，后端也没有 Work Task 模型。

`a-stock-data` 当前代码注释存在 V3.6.0 与 V3.7.1 引用差异，仓库中未安装该 Skill。原作者的公开仓库为 `simonlin1212/a-stock-data`，但没有 releases/tags，因此不能依赖版本号或 latest 分支，需要固定 commit SHA 与文件 checksum。

## Goals / Non-Goals

**Goals:**

- 用一套静态治理注册表覆盖全部生产资产，并自动生成治理目录。
- 将 Tier 0 质量检查变成可执行、可追溯、可阻断研究的服务端能力。
- 固定来源标准版本，自动检测上游变化并创建最小治理审阅任务。
- 复用现有数据管理、`job_run`、审计和 Preline 工作台，不建设第二套后台。

**Non-Goals:**

- 不在线编辑静态治理元数据。
- 不实现完整工作任务中心，只实现治理审阅所需的最小 Work Task。
- 不自动升级 `a-stock-data` 或自动修改 Provider。
- 不自动解析全部 SQL 生成字段血缘。
- 不提供原始数据行、任意 SQL、凭据或数据删除接口。

## Decisions

### 1. Local governance registry is the static source of truth

新增 `apps/server/src/lib/data-governance/`，将现有 `DataTableDef` 的治理部分拆成独立注册表：

```ts
type GovernanceAsset = {
  key: string;
  name: string;
  kind: "reference" | "raw" | "snapshot" | "derived" | "application";
  domain: DataDomain;
  tier: "tier_0" | "tier_1" | "tier_2";
  owner: Responsibility;
  steward: Responsibility;
  operator: Responsibility;
  classification: "internal" | "restricted";
  retention: RetentionPolicy;
  contract: DataContract;
  sourceStandardRefs: SourceStandardReference[];
  lineage: DataLineage;
  consumers: AssetConsumer[];
};
```

`DATA_CENTER_TABLES` 继续负责运行查询所需的表、时间和任务元数据，但治理字段从独立注册表引用，避免把大型业务注册表继续堆在 `data-center.ts`。

选择代码注册表而不是数据库 CRUD，是因为当前事实源已经围绕代码稳定工作，数据库可编辑元数据会导致实现、文档和后台三套口径。

### 2. Runtime evidence uses append-oriented PostgreSQL tables

新增以下表：

```text
data_quality_result
data_incident
data_incident_event
work_task
work_task_event
```

`data_quality_result` 保存资产、规则、规则版本、状态、严重度、实际指标、任务标识、检查时间和证据 JSON。状态仅允许 `passed | warning | failed | error`。

`data_incident` 保存当前事故状态，`data_incident_event` 保存开放、确认、处理、解决和关闭的追加事件。事故状态允许 `open | acknowledged | resolving | resolved | closed`。

`work_task` 保存治理审阅任务当前状态，`work_task_event` 保存状态变更。首期只供来源标准审阅和其他治理事件使用，字段保持通用，后续任务中心可直接复用。

所有结果和事件表不使用应用层删除接口；保留策略由后续生命周期治理统一执行。

### 3. Quality rules are versioned executable checks

规则在 `quality-rules.ts` 中注册，依赖稳定的 `checkKey` 和受控参数，不允许页面输入 SQL。

首期规则：

- `freshness.business_time`
- `completeness.required_columns`
- `uniqueness.primary_key`
- `validity.ohlcv`
- `coverage.active_symbols`
- `consistency.calendar_alignment`
- `pit.as_of_known_at`

规则定义包含 `id`、`version`、`assetKey`、`dimension`、`severity`、`triggerJobTypes` 和 `params`。规则结果保留执行时的规则版本，避免阈值调整污染历史。

质量检查使用参数化 SQL 或已有查询函数，Tier 0 全量检查，Tier 1/2 优先使用聚合和抽样；禁止对大表执行无界原始行扫描。

### 4. Quality gate is a server-side policy service

新增 `assertResearchDataReady(assetKeys)`：

- 查询资产最新严重结果和未解决事故。
- Tier 0 存在 `critical` 失败时抛出结构化 `409`。
- Tier 1 返回 warning。
- Tier 2 只记录。

回测、选股和个股分析入口在创建任务或生成新分析前调用该服务。门禁不能只靠前端提示。

迁移期使用配置：

```text
DATA_GOVERNANCE_GATE_MODE=off|warn|enforce
```

先影子运行、审核假阳性，再切换为 `enforce`。

### 5. Source standards pin Git commit and checksum

`source-standards.ts` 固定：

```ts
type SourceStandardReference = {
  id: "a-stock-data";
  repository: "https://github.com/simonlin1212/a-stock-data";
  commitSha: string;
  versionLabel: string;
  skillFileSha256: string;
  reviewedAt: string;
  capabilities: string[];
  snapshotPath: string;
};
```

由于上游没有 releases/tags，巡检使用 GitHub commits API 比较最新 commit SHA，并校验 `SKILL.md` 内容 SHA-256。首次实施必须先核对当前代码实际采用的版本；现有 V3.6.0/V3.7.1 引用只作为待解决输入，不能直接假设其中一个是准确基线。

固定快照保存在 `docs/external/a-stock-data/<commit>/`，至少包含 `SKILL.md`、`CHANGELOG.md` 和来源元数据。生产运行不读取该目录。

### 6. Source watch is a system Worker job

新增 `source-standard-watch` 作业，每天执行一次：

1. 读取固定引用。
2. 获取上游最新 commit 和 `SKILL.md`。
3. commit、checksum 或版本标签变化时写 `job_run` 结果。
4. 创建或更新 `source_standard_review` Work Task。
5. 需要高优处理时关联 Data Incident。

失败时只记录任务失败，不修改当前生产版本。连续失败超过阈值才创建“来源标准巡检不可用”事故。

选择系统 Worker，而不是产品 Workflow 或 Codex Automation，因为检测必须确定、可恢复、可审计，且不能依赖用户流程或 Agent 会话。

### 7. Governance UI extends the current console

在 `/home/data-management` 二级导航增加“治理”：

```text
治理
├── 总览
├── 资产与契约
├── 质量规则与结果
├── 来源标准
├── 治理任务
└── 数据事故
```

页面只读展示静态治理元数据。质量结果和事故可查看证据与状态，但首期不提供任意编辑或原始行查看。

### 8. APIs stay under the super-admin boundary

新增 API 均挂载到 `/api/v1/data-management/governance`：

```text
GET  /overview
GET  /assets
GET  /assets/:assetKey
GET  /quality/rules
GET  /quality/results
GET  /source-standards
GET  /work-tasks
GET  /work-tasks/:id
POST /work-tasks/:id/start
POST /work-tasks/:id/complete
POST /work-tasks/:id/cancel
GET  /incidents
GET  /incidents/:id
POST /incidents/:id/acknowledge
POST /incidents/:id/resolve
```

所有接口复用 `requireSuperAdmin()`。普通用户仍只访问 `/api/v1/system/data-status`。

## Data Model

### `data_quality_result`

```text
id bigserial
asset_key text
rule_id text
rule_version integer
status text
severity text
job_run_id bigint null
request_id text null
observed_value numeric null
details_json jsonb not null
checked_at timestamp not null
```

索引：`(asset_key, checked_at desc)`、`(rule_id, checked_at desc)`、`(status, checked_at desc)`。

### `data_incident`

```text
id bigserial
asset_key text null
incident_type text
severity text
status text
title text
description text
root_cause text null
payload_json jsonb not null
opened_at timestamp not null
acknowledged_at timestamp null
resolved_at timestamp null
```

### `data_incident_event`

```text
id bigserial
incident_id bigint
actor_user_id text null
event_type text
message text null
payload_json jsonb not null
created_at timestamp not null
```

### `work_task`

```text
id bigserial
task_type text
title text
status text
priority text
owner_role text
related_type text null
related_id text null
payload_json jsonb not null
result_json jsonb null
created_at timestamp not null
updated_at timestamp not null
completed_at timestamp null
```

### `work_task_event`

```text
id bigserial
task_id bigint
actor_user_id text null
event_type text
message text null
payload_json jsonb not null
created_at timestamp not null
```

## Alternatives Considered

### Database-editable governance catalog

支持在线维护 Owner 和 SLA，但会与代码、文档形成三套事实源，也增加权限和审计面。拒绝。

### Product Workflow for source watch

可复用已有编排能力，但用户流程可暂停、归档或由普通用户持有，不适合平台级定时治理。拒绝。

### UI-only quality warnings

实现便宜，但无法阻止不可信数据进入研究。Tier 0 必须在服务端阻断。拒绝。

### Automatic source standard upgrade

能减少人工操作，但 Skill 变化可能直接影响字段、限流和降级行为，无法保证可回滚。拒绝。

## Risks / Trade-offs

- **Tier 0 规则误报导致研究被阻塞** → 先 `warn` 影子运行并校准阈值，再切 `enforce`。
- **大表质量检查成本高** → Tier 0 使用聚合/索引查询；不在首期执行无界全表扫描。
- **静态注册表随 Schema 漂移** → CI 做 Schema/注册表差异检查，并生成文档。
- **上游仓库或 GitHub API 不稳定** → 保存固定快照，巡检失败不改变生产版本，连续失败才告警。
- **Work Task 扩大成完整任务系统** → 本期只提供治理任务后端和治理页展示，不实现完整任务中心。
- **历史质量阈值变化污染比较** → 每次结果保存规则版本和参数。

## Migration Plan

1. 新建运行证据表和索引，不修改现有表。
2. 建立治理注册表并做 Schema 差异审计。
3. 生成治理目录文档。
4. 固定 `a-stock-data` 当前实际基线并保存快照。
5. 上线来源标准巡检与治理 Work Task，先只观察。
6. 上线 Tier 0 质量规则，`warn` 模式运行并校准。
7. 上线数据管理“治理”页。
8. 切换 Tier 0 门禁为 `enforce`。

回滚策略：

- 门禁可通过配置回退到 `warn` 或 `off`。
- 来源巡检可停用，但固定快照和已创建任务保留。
- 新表只追加，不回滚删除治理证据。
- 生产 Provider 和 `load_kline` 契约不因本变更改变。

## Open Questions

无。当前阻塞技术输入只有实施第一阶段必须完成的“当前代码实际采用的 `a-stock-data` 基线审计”，属于执行任务，不改变技术方案。

## Review Result

- **Status**: approved
- **Reviewer**: Codex self-review as builder
- **Blocking issues**: none identified
- **User-confirmed decisions**: 治理元数据即代码、Tier 0 门禁、系统 Worker 检测 `a-stock-data`、自动创建 Work Task、正式升级走 OpenSpec
- **Resolved input**: 当前生产实现实际采用 `a-stock-data v3.7.1`（commit `f90d67853b8108f13d286e1df20b357e2c5198a9`），已保存不可变快照。
- **Residual risk**: 首期质量规则阈值需要 `warn` 模式校准后再切 `enforce`。
