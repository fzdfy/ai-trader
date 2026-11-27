# SDD v2 到 v3 迁移说明

## Status

| 字段 | 值 |
|---|---|
| 来源版本 | [v2.md](./v2.md) |
| 目标版本 | [v3.md](./v3.md) |
| 生效日期 | 2026-11-27 |
| 生效范围 | 新变更默认使用 v3 |
| 历史兼容 | 已启动、已完成和已归档变更保留原版本记录 |

## Why Migrate

v2 将普通变更从逐阶段、逐任务确认中释放出来，但所有 L2 仍使用同一套实施前独立设计评审。对于影响局限、可回滚且不改变数据或契约语义的 L2，这会造成固定等待和重复上下文；对于跨服务、权限模型、数据口径和迁移，实施前设计评审仍然必要。

v3 将 L2 风险等级与保证档位分开，只调整独立设计评审的实施时机，不降低风险等级，不删除实施后审查、完整验证、TDD、视觉门禁或归档确认。

## Executive Summary

| 维度 | v2 | v3 |
|---|---|---|
| L2 元数据 | `type/risk/baseline/visual` | L2 额外声明 `assurance: bounded \| systemic` |
| bounded 判定 | 无 | 五项条件全部满足；任一不满足或有争议即 systemic |
| bounded 评审 | 实施前独立设计评审 + 实施后风险审查 | 不要求实施前独立设计评审；实施后独立代码与风险评审，修复后重新完整验证 |
| systemic 评审 | 独立评审 | 保留实施前独立设计评审和实施后独立代码与风险评审 |
| 档位变化 | 无定义 | bounded 条件失效必须硬停升级；systemic 实施后不得降级 |
| 五件套 | proposal、规格增量、design、tasks、verification | 不变 |
| TDD、视觉、验收、归档 | 保留 | 不变 |

## L2 Assurance Mapping

v3 的唯一 bounded 条件是：

1. 影响局限在一个可独立部署的服务、Provider 适配器或部署配置边界；
2. 不改变数据库 schema、数据语义、PIT、复权或回测口径；
3. 不改变权限模型、公共 API 或跨服务契约；
4. 可通过回滚代码或配置恢复，无需数据修复、重放或人工迁移；
5. 现有测试和验证能够覆盖改动边界。

任一条件不满足或分类存在争议时必须使用 `assurance: systemic`。

例如：

- 单个部署配置中的认证 Origin 修复，若五项条件全部满足，可用 `bounded`。
- 改变认证权限模型、数据库 schema、数据口径、PIT、公共 API 或跨服务契约时必须使用 `systemic`。
- 无法通过回滚代码或配置恢复，或现有测试无法覆盖边界时必须使用 `systemic`。

## Review Timing

### bounded

```text
完整 design + tasks
  ↓
用户规划确认
  ↓
实施 + TDD
  ↓
实施后独立代码与风险评审
  ↓
修复 findings
  ↓
最新完整验证
  ↓
用户验收
```

`verification.md` 记录评审者、日期、结论、findings 处理结果和评审后的最新验证。任何评审后的代码或配置修改都会使旧验证失效。

### systemic

```text
完整 design
  ↓
实施前独立设计评审
  ↓
用户规划确认
  ↓
实施 + TDD
  ↓
实施后独立代码与风险评审
  ↓
修复 findings
  ↓
最新完整验证
  ↓
用户验收
```

实施前评审写入 `design.md#Review Result`；实施后评审写入 `verification.md`。

## Preserved Rules

以下 v2 规则保持原样：

- OpenSpec 五件套；
- `tasks.md` 是唯一实施任务清单；
- 行为代码先取得失败测试，再实现到通过；
- 可见 UI 变化必须完成视觉探索、截图和用户确认；
- L2 的 `changes-required` 未清零不得请求验收；
- 完成声明前运行最新完整验证；
- 最终验收与归档分别确认；
- 归档时同步增量规格。

## Artifact Mapping

| v2 产物 | v3 去向 |
|---|---|
| `proposal.md` | 增加 L2 `assurance`；AC 和影响面保持 |
| `specs/*/spec.md` | 加入 bounded/systemic 行为场景 |
| `design.md` | 增加五项条件复核；systemic 保留实施前评审结果 |
| `tasks.md` | 任务结构不变；评审顺序按档位执行 |
| `verification.md` | 增加 L2 保证档位评审和评审后最新验证 |
| `docs/superpowers/specs` | 仍为补充材料，不是默认产物 |
| `docs/superpowers/plans` | 仍为长任务或并行任务的补充材料 |
| `.superpowers/sdd` | 仍只在选择 `executing-plans` 时使用 |

## Existing Changes

- 已归档 v1、v2 change 不重写。
- 已启动 change 继续使用启动时版本完成，除非用户明确要求迁移。
- 若迁移进行中的 L2 change，必须先确认五项条件，补充 `assurance`，并保持 original change 的范围和证据一致。
- 已开始实施后不得把 systemic 降为 bounded。

## Rollback

回滚到 v2：

1. 将 [README.md](./README.md) 的当前版本改回 v2；
2. 将 `AGENTS.md`、`docs/README.md`、`docs/standards/README.md` 和 `docs/standards/development-workflow.md` 的当前入口切回 [v2.md](./v2.md)；
3. 恢复 `openspec/config.yaml` 的 v2 元数据和评审规则；
4. 将 `docs/glossary.md` 中的 L2 保证档位术语回退，或明确标记为 v3 历史语言；
5. 保留 [v3.md](./v3.md) 与本迁移说明作为审计记录；
6. 不重写 v3 生效后已经形成的验证证据。

## Open Historical Items

- v3 仍保留完整的 OpenSpec 五件套；若 bounded L2 文档成本仍显著，应另行评估产物精简，不与本次评审时序优化混用。
- 本迁移不修改 v1、v2 历史文件。
