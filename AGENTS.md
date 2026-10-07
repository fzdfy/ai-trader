# AGENTS

Project-specific guidance for AI coding agents.

> **项目知识的唯一事实源是 [`docs/`](./docs/README.md)。** 本文件只放两类东西：① 每次动手都必须遵守的**常驻约束**；② **导航与铁律索引**。知识细节一律写到 `docs/`，这里不再重复。

## 项目一句话

pnpm monorepo，智能 A 股分析与策略平台：`apps/web`（React + Vite，:9080）· `apps/server`（Hono API + sync / feature worker，:3001）· `apps/quant`（Python FastAPI + akquant，:3002）· PostgreSQL（:5432，pgvector）· 日志栈 Alloy → Loki → Grafana。全局图见 [docs/README.md](./docs/README.md)。

## 知识导航（唯一事实源：docs/）

| 我想… | 去哪里看 |
|---|---|
| 搞懂系统长什么样（模块 / 端口 / 容器 / 部署） | [docs/architecture.md](./docs/architecture.md) |
| 改数据源 / 排查数据问题（A/B/C 三条链路） | [docs/data-pipeline.md](./docs/data-pipeline.md) |
| **动手改任何核心代码前**先看约束 | [docs/invariants.md](./docs/invariants.md) |
| 线上出问题（僵尸任务 / 东财熔断 / 回测超时） | [docs/runbooks.md](./docs/runbooks.md) |
| 想重复论证某个已定结论前 | [docs/decisions.md](./docs/decisions.md) |
| 遇到怪现象 / 想认领技术债 | [docs/issues.md](./docs/issues.md) |
| 看不懂某个术语 | [docs/glossary.md](./docs/glossary.md) |
| 想知道下一步做什么 | [docs/roadmap.md](./docs/roadmap.md) |

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

## 工具链注意

- `apps/quant/.venv` 被 gitignore，**代码搜索工具会静默跳过该目录**；查 akquant 本体源码须用 shell `grep`。
- 校验命令：`pnpm check-types`、`pnpm lint`。quant 侧未配置 lint / 类型检查命令。

## Astryx Design CLI
<!-- ASTRYX:START -->
Astryx v0.1.5 · 149 components
CLI: run every command as `pnpm exec astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   149 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->

## Frontend Design
- **每次编写/修改前端界面时，必须调用 `frontend-design` skill**（包括页面布局、组件、图表展示等一切前端 UI 工作），确保设计质量。

## React Best Practices
- **编写/修改 React 代码时，必须调用 `vercel-react-best-practices` skill**（React/Next.js 性能优化规范），确保组件实现符合最佳实践。
