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
| 改数据源 / 排查数据问题（A/B/C 三条链路） | [docs/data-pipeline.md](./docs/data-pipeline.md) |
| **动手改任何核心代码前**先看约束 | [docs/invariants.md](./docs/invariants.md) |
| 线上出问题（僵尸任务 / 东财熔断 / 回测超时） | [docs/runbooks.md](./docs/runbooks.md) |
| 想重复论证某个已定结论前 | [docs/decisions.md](./docs/decisions.md) |
| 遇到怪现象 / 想认领技术债 | [docs/issues.md](./docs/issues.md) |
| 看不懂某个术语 | [docs/glossary.md](./docs/glossary.md) |
| 想知道下一步做什么 | [docs/roadmap.md](./docs/roadmap.md) |
| 查看视觉原型与探索稿 | [docs/design/prototypes/](./docs/design/prototypes/) |
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
- 非平凡开发必须先澄清与规格，再使用 `tasks.md` 实施；禁止无计划直接改业务代码。
- 前端统一使用 Preline UI + Tailwind CSS；新增和重写 UI 必须复用 `apps/web/src/components/preline-ui/` 语义组件。
- 量化工作台原稿 `quant-workbench-assistant.html` 不得覆盖；新视觉探索必须复制到 `docs/design/prototypes/explorations/`。

## 工具链注意

- `apps/quant/.venv` 被 gitignore，**代码搜索工具会静默跳过该目录**；查 akquant 本体源码须用 shell `grep`。
- 校验命令：`pnpm check-types`、`pnpm lint`。quant 侧未配置 lint / 类型检查命令。

## 前端设计与 Preline

- 编写或重写界面时使用 Preline UI + Tailwind CSS v4；详细规则见 [design.md](./docs/standards/design.md) 和 [frontend.md](./docs/standards/frontend.md)。
- Preline 只负责 DOM 行为。使用 `preline/non-auto`，在路由挂载后初始化；手动实例必须在卸载时 `destroy()`。
- 颜色、边框、表面、间距和状态使用 Preline/Tailwind 语义 token，不在业务组件散落 raw hex。
- 密集数据使用行式 Table/List；Card 只用于独立指标、设置分组或内容块。
- 新 UI 必须支持浅色、深色、移动端、键盘焦点和 reduced motion。
- 每次编写/修改前端界面时调用 `frontend-design` skill；编写/修改 React 时调用 `react-best-practices` skill。

## 规范驱动 AI Coding

非平凡开发按以下阶段执行：

| 阶段 | Skill / 工具 | 产物 |
|---|---|---|
| 需求澄清 | `grill-with-docs` + `grilling` + `domain-modeling` | 术语、ADR、边界和异常场景 |
| 需求分析 | `openspec-propose` / `openspec-continue-change` | proposal、capability specs |
| 技术方案 | `brainstorming` | design、替代方案与取舍 |
| 实施计划 | OpenSpec | `tasks.md` |
| 编码前简化 | `ponytail` | 最小完整方案 |
| 编码实施 | `test-driven-development` | RED → GREEN 证据 |
| 编码后精简 | `code-simplifier` | 行为不变的可读性改进 |
| 最终检查 | `requesting-code-review` + `ponytail-review` | 质量、安全、复杂度结论 |
| 归档 | `openspec-verify-change` + `openspec-archive-change` | 验证结果与同步规格 |

规则：

- 需求不确定时先使用 Grill-with-docs，不把猜测写成规格。
- 只有 `tasks.md` 是实施任务清单；对话中的临时清单不替代它。
- 没有失败测试证据，不得声称新行为通过。
- 完成声明前使用 `verification-before-completion` 并运行最新完整验证命令。
- 用户明确要求一次性执行完整流程时，可按顺序执行规划和实施，但仍保留各阶段产物。

## 文件职责

- `AGENTS.md`：工作入口、常驻约束、工具路由。
- `docs/standards/`：长期技术标准。
- `.agents/skills/`：可执行专业方法。
- `openspec/specs/`：长期系统行为规格。
- `openspec/changes/`：单次变更记录。
- `docs/design/prototypes/initial/`：确认过的视觉基准。
- `docs/design/prototypes/explorations/`：不覆盖原稿的探索版本。
- `docs/adr/`：难回滚、非显然、存在真实取舍的决策。
