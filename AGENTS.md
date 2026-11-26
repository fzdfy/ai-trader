# AGENTS

Project-specific guidance for AI coding agents.

> **项目知识的唯一事实源是 [`docs/`](./docs/README.md)。** 本文件只放三类东西：① 每次动手都必须遵守的**常驻约束**；② **导航与铁律索引**；③ 规范驱动开发工作流。

## 项目一句话

pnpm monorepo，智能 A 股分析与策略平台：`apps/web`（React + Vite，:9080）· `apps/server`（Hono API + sync / feature worker，:3001）· `apps/quant`（Python FastAPI + akquant，:3002）· PostgreSQL（:5432，pgvector）· 日志栈 Alloy → Loki → Grafana。全局图见 [docs/README.md](./docs/README.md)。

## 知识导航（唯一事实源：docs/）

| 我想… | 去哪里看 |
|---|---|
| 搞懂系统长什么样（模块 / 端口 / 容器 / 部署） | [docs/architecture.md](./docs/architecture.md) |
| 查看长期工程标准 | [总览](./docs/standards/README.md) · [架构](./docs/standards/architecture.md) · [前端](./docs/standards/frontend.md) · [后端](./docs/standards/backend.md) · [数据](./docs/standards/database.md) · [Agent](./docs/standards/agent.md) · [UI](./docs/standards/design.md) |
| 查看 AI 开发流程与文档职责 | [开发工作流入口](./docs/standards/development-workflow.md) · [**SDD v2**](./docs/standards/sdd/v2.md) |
| 改数据源 / 排查数据问题（A/B/C 三条链路） | [docs/data-pipeline.md](./docs/data-pipeline.md) |
| **动手改任何核心代码前**先看约束 | [docs/invariants.md](./docs/invariants.md) |
| 线上出问题（僵尸任务 / 东财熔断 / 回测超时） | [docs/runbooks.md](./docs/runbooks.md) |
| 想重复论证某个已定结论前 | [docs/decisions.md](./docs/decisions.md) |
| 遇到怪现象 / 想认领技术债 | [docs/issues.md](./docs/issues.md) |
| 查看业务术语 / 工程技术术语 | [业务术语](./docs/glossary.md) · [工程技术术语](./docs/technical-glossary.md) |
| 想知道下一步做什么 | [docs/roadmap.md](./docs/roadmap.md) |
| 查看视觉原型与探索稿 | [docs/design/prototypes/](./docs/design/prototypes/) |
| 查看完整 SDD 版本与迁移 | [SDD 版本索引](./docs/standards/sdd/README.md) |
| 查看 L2 补充技术方案 | [docs/superpowers/specs/](./docs/superpowers/specs/) |
| 查看当前变更规格与任务 | [openspec/changes/](./openspec/changes/) |

## 铁律索引（每条详情与证据见 [docs/invariants.md](./docs/invariants.md)）

- **INV-1** 取数按「不封 IP 优先」：mootdx > 腾讯 > 新浪 / 巨潮 / 同花顺 > 东财。
- **INV-2** 东财仅用于其独有数据，且必须走统一 `em_get()`，禁止直接 `requests.get`。
- **INV-3** `em_get` 防雪崩不可改：锁只覆盖单次请求、重试睡眠在锁外、连续失败 5 次熔断（冷却 **300s**）。
- **INV-4** 东财行情类端点统一走 `push2delay`，不用实时 `push2`。
- **INV-5** 东财个股新闻必须用 `cmsArticleWebOld` 参数并正确解 JSONP。
- **INV-6** 同一条降级链内不得混用不同复权口径。
- **INV-7** 回测入库源按标的固定（沪深腾讯 / 北交所东财），禁止静默降级。
- **INV-8** 回测复权默认后复权 `hfq`；前复权 `qfq` 禁止用于回测。
- **INV-9** `load_kline` 输出契约（`time` 索引 + `open/high/low/close/volume/amount/indicators`）不可改。
- **INV-10** PIT 复权：`as_of` 只取 `known_at <= as_of` 的复权快照。
- **INV-11** 任务记录表名是单数 `job_run`（写 `job_runs` 会报 `relation does not exist`）。
- **INV-12** 切取数层只改 `registry.py` 的 `_PROVIDER_CLASSES` + `_CAPABILITY_PRIORITY`。
- **INV-13** 切回测数据源必须改入库管道 + 重建历史数据 + 新旧源双跑比对。
- **INV-14** 换源 / 回测前必查：复权 PIT 化、停牌标记、涨跌停成交判定；baostock 不支持北交所。

## 常驻约束（每次动手都要遵守）

- 改数据源前先分清要改「取数层」还是「回测读取层」——两条独立链路，见 [data-pipeline.md](./docs/data-pipeline.md)。
- 回测要可信：默认后复权、PIT 取数、涨跌停按**原始价前收**判定。
- 排查任务状态先分清 `interrupted (stale | worker restart | server restart)` 三种来源，见 [runbooks.md](./docs/runbooks.md)。
- 不要重复论证 [decisions.md](./docs/decisions.md) 里已定的结论。
- 长期事实写入 `docs/standards/`；单次行为变更写入 OpenSpec；不要只改对话或临时原型。
- 非平凡开发先按 [SDD v2](./docs/standards/sdd/v2.md) 声明 `type`、`risk`、`baseline` 和 `visual`；L0 可直接处理，L1 使用薄 SDD，L2 使用完整设计和风险审查。
- 规划与实施计划确认后，可按批准范围连续执行低风险任务；范围、风险、认证、数据、迁移、视觉方向或计划结构变化时必须停止确认。
- 最终验收和归档分别确认；归档不能自动触发。
- 前端统一使用 Preline UI + Tailwind CSS；新增和重写 UI 必须复用 `apps/web/src/components/preline-ui/` 语义组件。
- 量化工作台原稿 `quant-workbench-assistant.html` 不得覆盖；新视觉探索必须复制到 `docs/design/prototypes/explorations/`。
- 视觉门禁不可跳过：只要需求新增或修改页面、组件、可见状态、交互、信息层级、加载/空/错误/部分成功、响应式或深浅模式，就必须先完成视觉探索、截图和用户确认；“沿用现有视觉方向”不构成豁免。
- 纯后端、数据、文档变更也必须明确写出 `Visual design: not applicable` 及无可见 UI 影响的原因；不确定是否影响 UI 时，默认需要视觉设计。

## 工具链注意

- `apps/quant/.venv` 被 gitignore，**代码搜索工具会静默跳过该目录**；查 akquant 本体源码须用 shell `grep`。
- 校验命令：`pnpm check-types`、`pnpm lint`。quant 侧未配置 lint / 类型检查命令。

## 前端设计与 Preline

- 编写或重写界面时使用 Preline UI + Tailwind CSS v4；详细规则见 [design.md](./docs/standards/design.md) 和 [frontend.md](./docs/standards/frontend.md)。
- Preline 只负责 DOM 行为。使用 `preline/non-auto`，在路由挂载后初始化；手动实例必须在卸载时 `destroy()`。
- 颜色、边框、表面、间距和状态使用 Preline/Tailwind 语义 token，不在业务组件散落 raw hex。
- 密集数据使用行式 Table/List；Card 只用于独立指标、设置分组或内容块。
- 新 UI 必须支持浅色、深色、移动端、键盘焦点和 reduced motion。
- 每次编写/修改前端界面时使用 `oil-ui` 确定视觉方向并完成视觉评审；编写/修改 React 时调用 `vercel-react-best-practices` skill。
- UI 影响的判断发生在编码前，不等到修改前端文件时才判断；若仍需新增视觉状态或交互，必须先走视觉门禁。

## 规范驱动 AI Coding

完整流程、变更分类、产物职责、确认模型和 Skill 路由见 [docs/standards/sdd/v2.md](./docs/standards/sdd/v2.md)。[development-workflow.md](./docs/standards/development-workflow.md) 只是短入口。

规则：

- `feature`、`bug`、`ui`、`refactor` 和 `hotfix` 共用一套薄 SDD，只改变主要完成证据。
- 认证、权限、安全、数据源、PIT、回测口径、迁移、公共 API 和跨服务变更至少按 L2 处理；风险覆盖变更类型。
- bug 必须基于规格、不变量、问题记录或已确认视觉基准；没有基线时先补最小契约，不把猜测直接写成 bug。
- 规划与实施计划确认后，可连续执行该计划内的低风险任务，不要求逐任务确认；遇到 [v2 硬停](./docs/standards/sdd/v2.md#hard-stops) 时必须停止。
- 有 UI 影响的需求，技术设计之后必须先做视觉设计并取得用户确认，再创建实施计划和实现任务；确认前 `tasks.md` 只能包含视觉设计门禁。
- 需求不确定时使用 `grilling`、`grill-with-docs` 或 `domain-modeling`；不把猜测写成规格。
- 新用户功能、多页面流程、权限或数据口径变化必须完成紧凑 PRD-lite；大型需求再生成完整 PRD。
- L2 技术方案未经独立评审批准，不得进入生产代码实施。
- 只有 `tasks.md` 是实施任务清单；对话中的临时清单不替代它。
- 每个行为任务必须写明失败测试和验证命令；普通变更不默认生成第二份实施计划。
- `using-superpowers`、`writing-plans` 和 `executing-plans` 不再作为普通变更必经步骤；L2 长任务、并行或每任务独立审查时可按需启用。
- `[x]` 只表示任务级实现与对应测试完成；整个 change 仍以验证章节和归档结果为准。
- 没有失败测试证据，不得声称新行为通过。
- 完成声明前使用 `verification-before-completion` 并运行最新完整验证命令。
- 测试和验证完成后也必须先提交用户验收；只有用户单独确认归档后，才能执行 OpenSpec archive。
- 用户明确要求一次性执行完整流程时，可按顺序执行规划和实施，但仍保留各阶段产物。

## 文件职责

- `AGENTS.md`：工作入口、常驻约束、工具路由。
- `docs/standards/`：长期技术标准。
- `docs/standards/development-workflow.md`：v2 短入口、常驻约束和版本路由。
- `docs/standards/sdd/`：版本化 SDD 完整流程、Skill 矩阵和 v1→v2 迁移。
- `docs/glossary.md`：业务与设计术语；根 `GLOSSARY.md` 只作为 skill 入口转发。
- `docs/technical-glossary.md`：架构、平台和实现术语索引。
- `.agents/skills/`：可执行专业方法。
- `openspec/specs/`：长期系统行为规格。
- `openspec/changes/`：单次变更记录。
- `docs/superpowers/specs/`：仅 L2 或独立评审需要的补充完整设计。
- `docs/superpowers/plans/`：仅 L2 长任务或并行实施的补充计划。
- `.superpowers/sdd/`：仅在启用 `executing-plans` 时使用的执行账本。
- `docs/design/prototypes/initial/`：确认过的视觉基准。
- `docs/design/prototypes/explorations/`：不覆盖原稿的探索版本。
- `docs/adr/`：难回滚、非显然、存在真实取舍的决策。
