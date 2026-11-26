# SDD v1 到 v2 迁移说明

## Status

| 字段 | 值 |
|---|---|
| 来源版本 | [v1.md](./v1.md) |
| 目标版本 | [v2.md](./v2.md) |
| 状态 | 已完成迁移设计，等待本次变更验收 |
| 生效范围 | 新变更默认使用 v2 |
| 历史兼容 | 已归档和已启动的 v1 变更保留原记录 |

## Why Migrate

v1 通过完整技术设计、第二份实施计划、每阶段确认和每任务确认保证可追溯性。代价是：

- 同一需求在多个文档重复；
- 普通 bug、UI 回归和文档修改承担项目级流程；
- 用户和 Agent 在低风险任务之间反复等待确认；
- 平行计划可能与 OpenSpec 规格、`tasks.md` 或验证报告不一致；
- 当前安装的 Superpowers 存在缺失子 Skill 和辅助脚本，执行账本需要手工补全。

v2 保留规格、TDD、视觉门禁、完成验证、风险审查和归档确认，但按风险调整材料，并把变更类型用于选择完成证据。

## Executive Summary

| 维度 | v1 | v2 |
|---|---|---|
| 流程入口 | 所有非平凡变更走同一重型阶段链 | L0 直接处理，L1 薄 SDD，L2 完整设计和审查 |
| 变更分类 | 没有正式元数据 | `type + risk + baseline + visual` |
| bug 处理 | 重新生成完整文档链 | 用既有期望、复现和回归测试闭环 |
| UI 处理 | 视觉设计始终独立成完整阶段 | `regression` 或 `new-design` 两种证据路径，用户确认不取消 |
| 计划 | `writing-plans` + `tasks.md` 双份 | `tasks.md` 唯一；完整计划仅 L2 可选 |
| 确认 | 每阶段、每任务确认 | 规划、硬边界、最终验收、归档确认 |
| Superpowers | 流程总控和执行框架 | 按需方法库 |
| 设计稿 | 普通变更也生成完整设计 | `design.md` 默认紧凑；完整稿仅 L2 |
| 验证 | 测试报告后多轮审查 | AC 到证据映射 + 风险审查 + 最新完整验证 |

## Stage Mapping

| v1 阶段 | v2 去向 | 迁移说明 |
|---|---|---|
| 1 需求澄清 | Classify、Clarify | 只对含糊需求执行完整澄清；明确 bug 直接寻找既有基线 |
| 2 产品需求 / PRD | Clarify | 仅新用户功能、多页面、权限或数据口径变化写 PRD-lite |
| 3 需求分析 | Plan | 由 `openspec-propose` 生成 proposal 和规格增量 |
| 4 技术方案 | Plan | 默认紧凑 `design.md`；L2 才需要完整设计稿 |
| 5 技术方案评审 | Plan / Review | L1 记录简短结论；L2 必须独立评审 |
| 6 视觉设计 | Visual Design Gate | `regression` 和 `new-design` 都保留用户确认 |
| 7 用户确认 | Confirmation Model | 合并为规划确认、硬停、验收和归档确认 |
| 8 实施与测试计划 | Plan | 默认折叠进 `tasks.md`；L2 可按需使用 `writing-plans` |
| 9 OpenSpec 任务清单 | Plan / Implement | `tasks.md` 继续作为唯一进度清单 |
| 10 编码前简化 | Implement | `ponytail` 降为可选；任务必须是最小完整方案 |
| 11 编码实施 | Implement | TDD 和项目领域 Skill 保持 |
| 12 测试报告 | Review / Verify | 合并进 `verification.md`，按 AC 和证据组织 |
| 13 编码后精简 | Review | `code-simplifier` 降为可选 |
| 14 最终检查 | Review | L1 自检；L2 独立审查 |
| 15 完成验证 | Verify | 保留 `verification-before-completion` |
| 16 归档 | Accept / Archive | 用户验收和归档确认继续分开 |

## Artifact Mapping

| v1 产物 | v2 去向 | 处理方式 |
|---|---|---|
| `docs/standards/development-workflow.md` | [v2.md](./v2.md) | v2 正文唯一；旧文件改为短入口和路由 |
| `AGENTS.md` 工作流摘要 | v2 入口规则 | 更新为风险分级、批量确认和硬停 |
| `openspec/changes/<change>/proposal.md` | 同路径 | 增加 `type/risk/baseline/visual` 和 AC ID |
| `openspec/changes/<change>/specs/*/spec.md` | 同路径 | 只保留外部行为；不写文件清单和测试命令 |
| `openspec/changes/<change>/design.md` | 同路径 | 默认紧凑；禁止复制 proposal 和示例任务 |
| `docs/superpowers/specs/*-design.md` | 条件产物 | 仅 L2、完整设计或独立评审需要 |
| `docs/superpowers/plans/*.md` | 条件产物 | 仅 L2 长任务、并行或每任务审查需要 |
| `openspec/changes/<change>/tasks.md` | 同路径 | 唯一任务源；增加 AC、文件、测试和验证命令 |
| `openspec/changes/<change>/verification.md` | 同路径 | 唯一验证证据汇总 |
| `.superpowers/sdd/*/progress.md` | 条件执行资产 | 只有选择 `executing-plans` 时生成 |
| `docs/superpowers/prd/*-prd.md` | 条件产物 | 仅跨团队、多阶段或独立产品评审 |
| `docs/adr/*.md` | 同路径 | 长期、难回滚、非显然决策继续保留 |
| `docs/design/prototypes/initial/` | 同路径 | 用户确认后的视觉基准 |
| `docs/design/prototypes/explorations/` | 同路径 | 新视觉探索，不覆盖历史原稿 |
| `openspec/specs/*/spec.md` | 同路径 | 归档后同步长期行为 |
| `openspec/changes/archive/` | 同路径 | 已归档记录不改写 |

没有删除用户产物。v1 的完整设计、计划和账本继续保留，但普通 v2 变更不再默认创建。

## Confirmation Mapping

| v1 确认点 | v2 确认点 | 说明 |
|---|---|---|
| 每个工作流阶段 | 规划评审 | 范围、规格、设计、风险和 tasks 一次评审 |
| 每个编号任务 | 计划批准后的连续执行 | 只在硬边界停止 |
| 每个视觉修改 | 视觉确认 | 仍不能由计划确认替代 |
| 测试报告确认 | 最终验收 | 验证完成后统一提交 |
| 归档确认 | 归档确认 | 保持独立，不能自动推导 |

### New Hard Stops

v2 用决策和风险边界替代逐任务中断：

- 范围、AC 或产品目标变化；
- 新架构或产品决策；
- 认证、权限、安全边界变化；
- 数据源、PIT、回测口径或迁移变化；
- 新依赖、外部服务或破坏性操作；
- 新的可见状态或视觉方向；
- 测试失败且不能按批准方案处理；
- 计划需要改变接口、风险等级或任务结构。

## Skill Migration

| Skill | v1 定位 | v2 定位 | 迁移原因 |
|---|---|---|---|
| `using-superpowers` | 全局强制启动 | `not-in-workflow` | Codex 和 AGENTS 已提供 Skill 路由，重复启动增加成本 |
| `executing-plans` | 计划执行器 | `optional` | 只用于 L2 长任务、并行或账本需求 |
| `writing-plans` | 编码前必经 | `optional` | `tasks.md` 已承载默认实施计划 |
| `brainstorming` | 技术方案必经 | `conditional` | 只处理含糊目标和非显然取舍 |
| `grill-with-docs` | 澄清阶段 | `conditional` | 需要文档化压测时使用 |
| `grilling` | 澄清阶段 | `conditional` | 需求模糊时使用 |
| `domain-modeling` | 术语/ADR | `conditional` | 术语冲突或长期决策时使用 |
| `openspec-propose` | 规划入口 | `required` | 新 OpenSpec 变更默认使用 |
| `openspec-continue-change` | 规划补全 | `optional` | 仅产物未齐备时使用 |
| `openspec-update-change` | 规划修订 | `conditional` | 决策、范围或任务需要重排时使用 |
| `openspec-apply-change` | 实施器 | `required` | 继续作为任务执行入口 |
| `openspec-verify-change` | 归档前验证 | `conditional` | 验收或归档前使用 |
| `openspec-sync-specs` | 规格同步 | `optional` | 明确要求提前同步时使用 |
| `openspec-archive-change` | 归档 | `conditional` | 用户单独确认后使用 |
| `openspec-explore` | 探索 | `optional` | 保持可用，不进入默认链 |
| `openspec-onboard` | 引导 | `not-in-workflow` | 仅培训场景，不属于变更流程 |
| `ponytail` | 编码前必经 | `optional` | 只在明显膨胀时作为最小化工具 |
| `test-driven-development` | 行为编码必经 | `required` | 质量门禁保留 |
| `code-simplifier` | 编码后必经 | `optional` | 避免对简单变更制造额外阶段 |
| `requesting-code-review` | 最终检查必经 | `conditional` | L2 或重大功能使用 |
| `receiving-code-review` | 审查反馈 | `conditional` | 收到审查意见时使用 |
| `code-review` | 项目审查 | `conditional` | L2 或高风险变更使用 |
| `ponytail-review` | 最终检查必经 | `conditional` | L2 或明确风险检查使用 |
| `verification-before-completion` | 完成前必经 | `required` | 统一完成证据 |
| `oil-ui` | 视觉必经 | `required` | 任何可见 UI 变化仍需使用 |
| `ui-design` | 视觉必经 | `conditional` | 需要项目 UI 规则和视觉 QA 时使用 |
| `frontend` | 前端实施 | `conditional` | 前端变更加载 |
| `vercel-react-best-practices` | React 实施 | `conditional` | 编写或审查 React 时加载 |
| `backend` | 后端实施 | `conditional` | 后端变更加载 |
| `database` | 数据实施 | `conditional` | 数据模型或读取行为变化时加载 |

## Compatibility

### Existing Changes

- 已归档 v1 change 不迁移。
- 在 v1 下已启动且尚未完成的 change，可以继续按其既有记录完成，避免中途重写证据。
- 若必须迁移进行中的 change，先完成产物映射，再切换版本；不得在 v1 和 v2 之间混用确认和验证标准。

### References

- 历史文档可以继续引用 `docs/superpowers/specs`、`plans` 和 `.superpowers/sdd`。
- v2 新变更只在条件满足时创建这些材料。
- 入口索引把 Superpowers 资产标记为历史或补充，不再称为默认规划源。

### Evidence

- v1 的测试报告继续有效作为历史证据。
- v2 的新证据必须关联 AC、命令和结果。
- 视觉回归不能因已有基准而跳过用户确认。

## Migration Sequence

1. 创建 v1 冻结基线。
2. 创建 v2 当前规范。
3. 创建本迁移说明。
4. 将 `development-workflow.md` 改为 v2 短入口。
5. 更新 `AGENTS.md` 的确认、Skill 和版本路由。
6. 更新 `docs/README.md`、`docs/standards/README.md` 和 `openspec/config.yaml`。
7. 执行跨版本标题、Skill 数量、链接、OpenSpec 和 diff 验证。
8. 用户验收后归档本次 change。

## Rollback

1. 将 [README.md](./README.md) 的当前版本改回 v1。
2. 恢复 `AGENTS.md` 和 `development-workflow.md` 的 v1 入口和确认规则。
3. 保留 `v2.md`、本迁移记录和本次 OpenSpec change 供审计。
4. 不重写 v1 期间产生的历史产物。

## Open Historical Items

- `executing-plans` 仍引用当前未安装的 `subagent-driven-development`、`systematic-debugging`、worktree 和 branch finishing 能力。
- 本迁移不删除或不修复这些 Superpowers 文件；v2 默认不依赖它们，L2 使用时必须验证实际工具是否可用。
- `.superpowers/sdd` 历史账本继续保留，但不作为 v2 默认状态源。
