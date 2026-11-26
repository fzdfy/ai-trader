# AI 开发工作流

本文件是 AI Coding 工作流的短入口。完整流程、变更分类、产物职责、确认模型和 Skill 路由以 [SDD v2](./sdd/v2.md) 为唯一事实源。

## 版本入口

| 文档 | 用途 |
|---|---|
| [sdd/README.md](./sdd/README.md) | SDD 版本索引和共享定义 |
| [sdd/v2.md](./sdd/v2.md) | **当前完整流程** |
| [sdd/v1.md](./sdd/v1.md) | 已冻结的历史流程 |
| [sdd/v1-to-v2.md](./sdd/v1-to-v2.md) | 迁移、兼容和回滚 |

新变更默认使用 v2。已归档或已在 v1 下完成记录的变更不重写。

## 开始变更前

先声明：

```text
type:     feature | bug | ui | refactor | hotfix
risk:     L0 | L1 | L2
baseline: spec | invariant | issue | confirmed-visual | none
visual:   not-applicable | regression | new-design
```

判断规则：

- `type` 决定主要完成证据，不决定流程数量。
- `risk` 决定设计、审查和验证强度。
- `baseline` 决定是恢复既有期望还是形成新决策。
- 认证、权限、安全、数据源、PIT、回测口径、迁移、公共 API 和跨服务变更至少为 L2。
- 无法确定风险时按更高等级处理。

## 风险路由

| 风险 | 默认处理 |
|---|---|
| `L0` | 直接修改并运行适用静态检查；默认不创建 OpenSpec；若存在可见、接口、数据或共享约束影响则升级 |
| `L1` | 使用紧凑 proposal、能力增量、design、tasks、verification；按批准计划连续执行低风险任务 |
| `L2` | 完整设计、独立评审、风险专项验证和回滚；可按需增加完整实施计划与执行账本 |

## 类型证据

| 类型 | 必需证据 |
|---|---|
| `feature` | 验收标准、失败测试、GREEN、回归 |
| `bug` | 既有期望、稳定复现、根因、失败回归测试、GREEN |
| `ui` regression | 已确认基准、用户视觉确认、前后截图、响应式、明暗主题、行为回归 |
| `ui` new-design | 视觉探索、用户确认、实现截图、交互验证 |
| `refactor` | 行为不变证据、既有测试基线、审查 |
| `hotfix` | 最小根因、修复验证、回滚方案、事后补全记录 |

没有基线时不能把猜测标记为 bug；应补最小行为或视觉契约。

## 必读约束

- 项目长期事实源仍是 `docs/`，动手修改核心代码前阅读 [invariants.md](../invariants.md)。
- OpenSpec 是变更控制面；普通变更不再默认生成第二份完整设计或实施计划。
- `tasks.md` 是唯一实施进度清单；行为代码必须先取得失败测试，再实现到通过。
- `verification.md` 是唯一验证证据汇总；完成声明前必须运行最新完整命令。
- 可执行方法按需加载，`using-superpowers`、`writing-plans` 和 `executing-plans` 不是普通变更必经流程。
- L2 长任务或并行任务可以使用完整计划与执行账本，但必须与 `tasks.md` 和 `verification.md` 保持一致。

## 视觉门禁

任何新增或修改页面、组件、可见状态、交互、信息层级、加载/空/错误/部分成功、响应式或明暗模式都必须执行视觉门禁：

1. 使用 `oil-ui` 和适用的 `ui-design` 规则；
2. 从确认基准复制探索稿到 `docs/design/prototypes/explorations/`，不覆盖历史原稿；
3. 覆盖受影响状态、桌面/移动和浅色/深色，并生成真实截图；
4. 取得用户对视觉稿或回归目标的确认；
5. 视觉确认后才能执行生产代码任务。

纯后端、数据、文档或基础设施变更必须在 proposal 写明 `Visual design: not applicable` 和具体原因。无法确定是否影响 UI 时按需要视觉设计处理。

## 风险审查

- L1 至少完成任务验证、风险自检和最新完整验证。
- L2 必须按风险执行独立技术或代码审查、安全/数据/迁移专项检查和回滚验证。
- UI 变更同时检查视觉回归、键盘、移动端和缺失状态。
- 审查发现不能在不改变规格或风险等级的前提下处理时，触发硬停。

## 确认与停止

默认确认点：

1. 规划与实施计划确认；
2. 按批准计划连续执行；
3. 最终验收；
4. 单独确认归档。

规划确认和实施授权可以由用户同一句话完成。视觉确认、最终验收和归档确认不能由其他确认自动推导。

遇到以下情况必须停止：

- 范围、验收标准或产品目标变化；
- 新架构或产品决策；
- 认证、权限、安全边界变化；
- 数据源、PIT、回测口径或迁移变化；
- 新依赖、外部服务或破坏性操作；
- 新视觉方向、可见状态或交互；
- 测试失败且不能按批准方案处理；
- 计划需要改变接口、风险等级或任务结构。

## 文档职责

| 文档 | 职责 |
|---|---|
| `openspec/changes/<change>/proposal.md` | Why、范围、元数据、AC、影响、视觉状态 |
| `openspec/changes/<change>/specs/*/spec.md` | 外部可观察行为 |
| `openspec/changes/<change>/design.md` | 技术决策、替代方案、风险和回滚 |
| `openspec/changes/<change>/tasks.md` | 唯一任务、测试和验证命令 |
| `openspec/changes/<change>/verification.md` | AC 到证据的映射 |
| `docs/superpowers/specs/` | 仅 L2 完整设计补充 |
| `docs/superpowers/plans/` | 仅 L2 长任务或并行实施的补充计划 |
| `.superpowers/sdd/` | 仅在启用 `executing-plans` 时作为执行账本 |

同一事实只定义一次。补充材料可以链接规格和任务，但不得复制成平行事实源。

## 归档

测试、验证和审查通过不等于可以归档。流程是：

1. 提交 `verification.md` 和最新完整验证证据；
2. 请求用户验收；
3. 用户验收通过后另行询问归档；
4. 用户单独确认后执行 OpenSpec archive；
5. 同步适用的增量规格到 `openspec/specs/`。

任何流程冲突以 [SDD v2](./sdd/v2.md) 为准。
