# Design

## Context

当前开发工作流由 [development-workflow.md](../../../docs/standards/development-workflow.md)、`AGENTS.md`、OpenSpec、项目级 Skills 和三处 Superpowers 资产共同组成：

- `.agents/skills/` 保存可执行方法；
- `docs/superpowers/specs` 与 `docs/superpowers/plans` 保存重复的完整设计和实施计划；
- `.superpowers/sdd/` 保存执行账本和任务 brief。

现有流程已经证明可以防止跳过规格、测试和验证，但普通变更也要承担完整设计稿、独立实施计划、每阶段确认和每任务确认。当前安装的 Superpowers 还会引用未安装的 `subagent-driven-development`、`systematic-debugging`、worktree 和分支收尾能力，实际执行时只能手工维护账本。

方案动机和能力约束见 [proposal.md](./proposal.md) 与 [spec.md](./specs/ai-coding-workflow/spec.md)。

## Goals / Non-Goals

**Goals:**

- 形成可长期维护、可审计、可回滚的 SDD v1/v2 版本基线。
- 让读者从版本文档直接理解流程、产物、确认门禁、Skill 职责和触发时机。
- 让 bug、UI、功能、重构和 hotfix 共用一套薄 SDD，但使用不同完成证据。
- 让风险等级决定执行强度，防止用变更类型规避安全、数据和视觉门禁。
- 保留 TDD、完成验证、最终审查和归档确认。

**Non-Goals:**

- 不重写已归档 OpenSpec change。
- 不删除现有 Skill 文件或历史 Superpowers 文档。
- 不改变业务代码、运行时接口、数据库和视觉系统。
- 不把所有 Skill 自动加载到一个统一入口。

## Decisions

### 1. 使用单一 SDD 标准目录和四个版本文档

新增：

```text
docs/standards/sdd/
├── README.md          # 版本索引、当前版本和阅读顺序
├── v1.md              # 历史流程完整基线
├── v2.md              # 当前流程完整基线
└── v1-to-v2.md        # 迁移和兼容说明
```

选择每个版本一份自包含文档，而不是把一个版本拆成多个小型说明文件。版本内部需要频繁交叉引用流程、产物和 Skill，单文件更容易审计和离线阅读；共享导航放在 `README.md`。

替代方案：

- 每个版本建立完整目录：扩展性好，但普通变更阅读成本高，职责容易再次碎片化。
- 只保留一个 `development-workflow.md`：节省文件数，但无法保留 v1 的可理解历史。

### 2. v1 冻结为可执行的历史基线

`v1.md` 记录本次改动前的真实流程，而不是重新设计一个理论 v1。内容至少包括：

- 版本状态、适用范围和设计目标；
- 当前标准实际存在的十六个阶段及其用户确认门禁；
- OpenSpec、Superpowers、Ponytail、项目领域 Skill 的协同关系；
- 产物路径和每类文档的唯一职责；
- v1 当时未建立正式 `type` 字段时，功能、修复、UI 和重构等工作的实际处理方式；
- v1 使用的完整 Skill 矩阵：名称、职责、输入、输出、使用阶段和是否强制；
- 已知成本、失败模式和迁移入口。

v1 文档不修改归档资料，也不把后来出现的 v2 规则倒灌到历史描述中。

### 3. v2 使用“类型 + 风险 + 基线”的单一变更模型

每个变更声明：

```text
type:     feature | bug | ui | refactor | hotfix
risk:     L0 | L1 | L2
baseline: spec | invariant | issue | confirmed-visual | none
visual:   not-applicable | regression | new-design
```

- `type` 只决定主要证据模板，不决定流程数量。
- `risk` 决定设计、评审、验证和执行强度。
- `baseline` 判断变更是在恢复既有期望，还是产生新的行为或视觉决策。
- `visual` 由可见影响决定，L0 后端或文档变更必须写明不适用原因。

风险覆盖类型：身份认证 bug、数据源修复、PIT 或数据库迁移始终按 L2 处理。

### 4. 普通变更保持 OpenSpec 五个事实面，取消平行副本

v2 的默认产物：

1. `proposal.md`：Why、范围、变更元数据、验收 ID、视觉影响；
2. `specs/<capability>/spec.md`：外部可观察行为；
3. `design.md`：决策、替代方案、风险与回滚；无新决策时只写简短结论；
4. `tasks.md`：唯一实施清单，关联验收 ID、文件、测试和验证命令；
5. `verification.md`：验收 ID 到证据的映射。

`docs/superpowers/specs` 与 `plans` 仅在 L2、多人并行或独立技术评审需要完整文档时生成，并链接为补充材料，不复制 OpenSpec 的事实。

### 5. 变更类型使用不同的完成证据

| 类型 | 主要输入 | 完成证据 |
|---|---|---|
| `feature` | 新增或改变已确认行为 | AC、失败测试、GREEN、完整回归 |
| `bug` | 既有期望与实际的差异 | 稳定复现、根因、失败回归测试、GREEN |
| `ui` regression | 已确认视觉基准 | 基准差异、用户确认、前后截图、受影响状态、响应式、明暗主题、行为回归 |
| `ui` new-design | 新的视觉意图 | 视觉探索、用户确认、实现截图、交互验证 |
| `refactor` | 行为不变的代码调整 | 既有测试基线、审查、无契约变化说明 |
| `hotfix` | 生产紧急修复 | 最小根因、修复验证、回滚方案、事后补全记录 |

若 bug 或 UI 修复没有既有期望，先补最小行为或视觉基线；不能把猜测直接标记为 bug。

### 6. Superpowers 降级为按需方法库

OpenSpec 是规划与变更控制面。Superpowers 中的以下能力保留为独立方法：

- 需求澄清：`grilling`、`grill-with-docs`、`domain-modeling`；
- 方案讨论：`brainstorming`；
- 行为编码：`test-driven-development`；
- 完成验证：`verification-before-completion`；
- 审查反馈：`requesting-code-review`、`receiving-code-review`、`code-review`、`ponytail-review`。

以下能力不再作为普通变更必经步骤：

- `using-superpowers` 强制启动路由；
- `writing-plans` 默认生成第二份实施计划；
- `executing-plans` 默认生成 `.superpowers/sdd` 账本和每任务 brief。

L2 长任务、并行 Agent 或每任务独立审查仍可选择 `writing-plans` 和 `executing-plans`。

Skill 矩阵的范围必须明确：

- v1 覆盖当前工作流阶段、AGENTS 和项目领域规则直接引用的全部 Skill，并补充 `using-superpowers`、`writing-plans`、`executing-plans` 等执行支撑能力；
- v2 将 `.agents/skills/` 中当时安装的全部 Skill 分类为 `required | conditional | optional | not-in-workflow`，避免把“局部清单”称为完整矩阵。

### 7. 用户确认改为批量授权和硬停

默认确认点：

1. 规划与实施计划一次确认；
2. 按批准计划连续执行，遇到硬边界才停止；
3. 最终验收；
4. 单独确认归档。

硬停包括：范围变化、新产品决策、认证/权限/数据源/PIT/迁移、破坏性操作、新依赖、计划外失败和新的视觉方向。

### 8. 版本文档采用稳定内容契约

`v1.md` 和 `v2.md` 都使用相同的一级内容结构，方便并排比较：

```text
Status and Scope
Design Principles
Change Classification
Workflow
Artifacts
Confirmation Model
Skill Routing Matrix
Quality Gates
Known Costs and Failure Modes
Version Relationships
```

Skill 矩阵固定列出：Skill、职责、输入、输出、使用阶段、触发条件、状态。这样每个版本都能回答“用了什么、为什么用、何时用”。

## Risks / Trade-offs

- **流程执行者仍可能把所有文档再复制一遍** → `v2.md`、`tasks.md` 和 `verification.md` 必须明确禁止平行事实源，迁移文档给出路径映射。
- **取消逐任务确认可能降低中途可见性** → 保留规划、验收、归档和硬边界确认，并要求每个任务在 `tasks.md` 记录证据。
- **UI 回归被误当作视觉豁免** → `visual: regression` 同样保留用户视觉确认；已有基准只减少探索范围，不取消截图和确认。
- **`using-superpowers` Skill 仍带强制语气** → 在 `AGENTS.md` 中声明项目 v2 的 Skill 路由优先于 Superpowers 自举规则；不修改已安装 Skill 本体。
- **bug 与 feature 被错误分类** → 用 `baseline` 字段强制判断既有期望是否存在；没有基线时先补最小契约。
- **v1 与 v2 内容漂移** → v1 仅作冻结快照，不再接收新规则；新规则只写 v2 和迁移文档。
- **文档版本化本身增加维护面** → 只维护四个标准文档；历史变更继续由 OpenSpec archive 追踪。

## Migration Plan

1. 创建 `docs/standards/sdd/README.md`、`v1.md`、`v2.md` 和 `v1-to-v2.md`。
2. 将 `v2.md` 设为 v2 唯一完整流程标准，`docs/standards/development-workflow.md` 只保留短入口、常驻规则和版本路由，避免双重事实源。
3. 更新 `AGENTS.md` 的常驻约束、确认语义、Superpowers 定位和版本入口。
4. 更新 `docs/README.md`、`docs/standards/README.md` 与 OpenSpec 配置中的 v2 路由规则。
5. 保留现有 Skills、`docs/superpowers` 和 `.superpowers/sdd` 历史资产，不删除、不批量重写。
6. 新变更默认使用 v2；本次之前的已归档和进行中变更继续按其既有记录完成。

回滚：

- 将 `README.md` 的当前版本指回 v1；
- 恢复 `AGENTS.md` 与 `development-workflow.md` 的 v1 入口；
- v2 文件保留用于审计，不删除用户已有记录。

## Visual Design

`Visual design: not applicable`。本次不修改界面、可见状态、交互、信息层级、响应式或明暗模式。

## Open Questions

无。v1 的内容范围、v2 的模式和迁移文档均已在用户确认的方向内定义。

## Review Result

- 日期：2026-11-26
- 评审者：独立技术评审子代理
- 结论：`approved`
- 首轮阻塞项及处理：
  - 将 v1 从错误阶段数修正为当前实际的十六阶段，并明确 v1 没有正式变更类型字段。
  - 明确 `v2.md` 是唯一完整流程正文，`development-workflow.md` 只保留短入口和路由。
  - 将 Skill 矩阵范围扩展为 v1 实际引用项和 v2 全部三十个已安装 Skill，并要求按 frontmatter `name` 分类。
  - 为 `baseline` 增加 `invariant` 和 `issue`。
  - 明确 UI 回归仍要求编码前用户视觉确认。
  - 修正任务中的 shell 命令，并加入可执行的 Markdown 链接检查。
- 复评结果：无 Critical、Important 或 Minor findings；版本化文档、Skill 职责、变更路由、批量确认、迁移与回滚方案可以进入实施。
