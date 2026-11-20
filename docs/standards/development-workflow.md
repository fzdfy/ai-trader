# AI 开发工作流

这是非平凡需求从澄清到归档的唯一流程标准。`AGENTS.md` 只保留入口摘要；具体阶段、产物位置和完成条件以本文为准。

## 产物位置

| 产物 | 唯一位置 | 说明 |
|---|---|---|
| 长期工程标准 | `docs/standards/` | 架构、前后端、数据、Agent、UI 与开发流程 |
| 业务与设计术语 | `docs/glossary.md` | 根 `GLOSSARY.md` 只作为 `domain-modeling` 的入口转发 |
| 工程技术术语 | `docs/technical-glossary.md` | 架构词、平台词、实现词和源码位置索引 |
| 难回滚决策 | `docs/adr/` | 满足难回滚、非显然、真实取舍三项条件才新增 |
| 产品需求 / PRD-lite | `openspec/changes/<change>/proposal.md` | 目标用户、问题、场景、成功指标、非目标和验收标准 |
| 完整 PRD（大型需求） | `docs/superpowers/prd/YYYY-MM-DD-<topic>-prd.md` | 跨团队、多阶段或需要独立产品评审时使用 |
| 技术方案设计稿 | `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` | `brainstorming` 的完整设计产物 |
| 技术方案评审 | `openspec/changes/<change>/design.md` 的 `Review Result` | 评审者、结论、阻塞项和批准状态 |
| 实施与测试计划 | `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` | 文件边界、接口、任务级测试和验证命令 |
| 单次变更 | `openspec/changes/<change>/` | proposal、capability specs、design、tasks、verification |
| 测试报告 | `openspec/changes/<change>/verification.md` | 命令、结果、跳过项、未覆盖项和人工验收 |
| 长期系统行为规格 | `openspec/specs/` | 变更验证并归档后同步 |
| 视觉基准 | `docs/design/prototypes/initial/` | 用户确认后的参考稿 |
| 视觉探索 | `docs/design/prototypes/explorations/` | 不覆盖历史和确认稿 |

## 阶段

| 阶段 | 方法 | 完成条件 |
|---|---|---|
| 需求澄清 | `grill-with-docs`、`grilling`、`domain-modeling` | 设计树无未决分叉；术语和 ADR 已落到对应位置 |
| 产品需求 / PRD | PRD-lite 或完整 PRD | 用户、场景、成功指标、非目标和验收标准明确 |
| 需求分析 | `openspec-propose` / `openspec-continue-change` | proposal 与 capability specs 完成 |
| 技术方案 | `brainstorming` | 完整设计稿写入 `docs/superpowers/specs/` |
| 技术方案评审 | builder check + 独立技术评审 | 评审结论、阻塞项和批准状态写入 `design.md#Review Result` |
| 视觉设计 | `oil-ui`、`ui-design` | 设计方向、探索稿、缺失态和四类视觉检查完成 |
| 用户确认 | 用户逐步评审 | 每个阶段和每个实施任务单独确认后才能执行该步 |
| 实施与测试计划 | `writing-plans` | 每个任务有明确文件、接口、失败测试和验证命令 |
| OpenSpec 任务清单 | OpenSpec | `tasks.md` 是唯一实施进度清单，并映射计划任务 |
| 编码前简化 | `ponytail` | 选择最小完整方案 |
| 编码实施 | `test-driven-development` | 每次只执行一个已确认任务，并取得 RED → GREEN 证据 |
| 测试报告 | 自动化 + 人工验收 | 单元、集成、接口、E2E、异常态和回归结果写入 `verification.md` |
| 编码后精简 | `code-simplifier` | 行为不变，测试保持通过 |
| 最终检查 | `requesting-code-review`、`ponytail-review` | 正确性、安全、数据风险和复杂度有结论 |
| 完成验证 | `verification-before-completion` | 使用最新完整命令取得证据，并与测试报告一致 |
| 归档 | `openspec-verify-change`、`openspec-archive-change` | 验收通过，增量规格同步到 `openspec/specs/` |

## 逐步确认门禁

非平凡开发必须一步一步执行，任何人不得自行连续推进。

### 什么算一步

- 一个工作流阶段，例如需求澄清、PRD、OpenSpec 规格、技术设计、方案评审、视觉设计、计划、测试报告、最终检查。
- `tasks.md` 中一个编号任务，例如 `2.1`、`2.2`。
- 一个阶段产生多个可独立验收产物时，每个可独立验收的产物分别算一步。

单次明确的小改动可以视为一步，但用户请求只授权该步本身，不授权额外修改。

### 每步执行协议

1. 开始前说明本步名称、计划修改、预期测试和主要风险，等待用户明确确认。
2. 用户确认后，只执行这一步，不开始下一步。
3. 完成后立即停止，汇报实际改动、验证命令与结果、未完成项和下一步。
4. 用户明确回复“确认继续下一步”后，才能执行下一个编号步骤。
5. 任何阻塞、范围变化、技术方案偏差或新增依赖都必须单独确认。

### 确认语义

- “确认视觉稿”只确认视觉设计，不授权创建实现任务或编写生产代码。
- “确认计划”只确认计划内容，不授权开始实施。
- “全部同意”只确认当次列出的问题、选项或决策，不授权后续实施。
- “继续”只授权紧接当前汇报之后的一个步骤，不等于授权到归档。
- 工作流阶段确认不能替代 `tasks.md` 任务确认。
- 历史步骤的确认不能复用于新步骤。
- 测试通过、验证通过或审查通过都不能自动触发归档；归档必须单独询问并取得用户明确确认。

用户明确要求一次性连续执行时，必须先限定连续执行的范围和终点。范围之外仍按本门禁执行；到达终点后立即停止并请求确认。

## PRD 门禁

- 新用户功能、多页面流程、权限或数据口径变化必须完成 PRD-lite。
- 小型内部修复可以把 PRD-lite 合并进 `proposal.md`，但不得省略用户、场景、验收标准和非目标。
- 只有跨团队、多阶段发布或需要独立产品评审时，才新增完整 PRD，避免每个改动重复写长文档。

## 技术方案评审门禁

- 设计必须说明至少一个可行替代方案、取舍、失败模式、兼容性和回滚方式。
- 评审必须检查接口、数据模型、安全边界、性能、可测试性和运维影响。
- `design.md` 的 `Review Result` 必须记录评审者、日期、`approved | changes-required`、阻塞项和处理结果。
- `changes-required` 未清零前，禁止编写生产代码。

## 视觉设计门禁

任何新增或修改页面、组件、可见状态、交互、信息层级、数据呈现、操作文案、响应式或明暗模式的需求都必须经过视觉设计。沿用现有视觉语言只表示复用方向，不表示可以不画新增状态。

触发条件包括但不限于：

- 新增页面、区域、卡片、表格列、流程或操作入口。
- 新增加载、空、错误、部分成功、成功、过期或不一致状态。
- 修改数据来源、状态文案、操作反馈或来源标识的呈现。
- 修改桌面/移动端、浅色/深色或键盘交互中的可见行为。

门禁顺序：

1. 在 `brainstorming` 技术设计完成后、创建实施计划前，使用 `oil-ui` 和 `ui-design`。
2. 从当前确认基准复制到 `docs/design/prototypes/explorations/`，不覆盖历史原稿。
3. 覆盖受影响状态和桌面/移动端、浅色/深色，生成真实截图并处理工具错误。
4. 用户确认视觉稿后，才能创建包含生产代码步骤的实施计划与 `tasks.md` 实现任务。
5. 确认前，OpenSpec `tasks.md` 只能包含 `## 0. Visual Design Gate`，不得出现实现任务。

例外只适用于没有任何可见 UI 行为变化的纯后端、数据或文档变更。例外必须在 proposal 中写明 `Visual design: not applicable` 和具体原因；无法确定是否影响 UI 时默认需要视觉设计。

## 测试计划与报告

- 编码前，`writing-plans` 计划必须列出每个任务的失败测试、测试文件、验证命令和预期输出。
- 测试范围按改动选择单元、接口、集成、E2E、视觉、数据质量、性能和安全测试；适用的视觉测试不得因“沿用现有主题”省略，不适用的项要写明原因。
- 编码完成后，`verification.md` 必须记录通过、失败、跳过、未覆盖和环境阻塞。
- 最终验证必须重新运行完整命令，不能只引用任务开发过程中的局部测试。

## 外部数据标准升级

`a-stock-data` 只作为开发期来源规范，生产运行以仓库 Provider、注册表和限流配置为准。

1. 固定基线：版本、commit、`SKILL.md` SHA-256 和快照写入 `docs/external/a-stock-data/<commit>/`；当前基线由 `source-standards.ts` 声明。
2. 自动巡检：每日 `source-standard-watch` 比较上游最新 commit、版本标签和 checksum。
3. 漂移处理：发现变化只创建一个待审阅 Work Task，`relatedId` 使用上游 commit SHA；重复检查不重复建单。
4. 影响分析：审阅数据源、字段、限流、降级和兼容性，结论写回任务，不直接修改生产代码。
5. 生产升级：任何 Provider、字段、限流或降级配置变化必须先建立独立 OpenSpec change，完成测试和回滚评估后实施。
6. 快照不可变：已固定目录不得覆盖；新版本保存到新 commit 目录，并保留旧版本用于追溯。

## 任务状态语义

- `[x]` 表示该任务本身的代码或文档产物已完成，并且有对应失败测试、GREEN 结果或静态检查证据；不代表整个 OpenSpec change 已验收。
- 端到端、真实上游、异常态和生产环境验证统一放在“验证”章节的任务中。
- OpenSpec 的 `isComplete: true` 只表示 proposal、specs、design、tasks 四类规划产物齐全；总进度以 `tasks.md` 的勾选数以及最后验证结果为准。
- 只有验证章节全部完成、测试报告与最新命令一致、代码审查通过并归档后，才能把整个 change 称为“完成”。

## 文档维护

1. 先更新长期标准，再修改 OpenSpec 能力规格。
2. 同一规则只在长期标准中定义一次，其他文档只引用。
3. 单次方案不写进长期标准；稳定结论才上移。
4. 生成型文档不得手工维护；修改源 Markdown 后重新运行生成器。
