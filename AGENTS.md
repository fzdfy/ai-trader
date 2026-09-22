# AGENTS

Project-specific guidance for AI coding agents.

## 项目架构

pnpm monorepo，智能 A 股分析与策略平台：

| 模块 | 路径 | 说明 |
|------|------|------|
| 前端 | `apps/web` | React + Vite；nginx 代理（:80，本地 :9080） |
| API | `apps/server` | Hono（:3001）；含 sync-worker / feature-worker 定时任务 |
| 回测 | `apps/quant` | Python FastAPI + akquant（:3002） |
| 数据库 | PostgreSQL | :5432，pgvector |

## 数据链路

**取数层与回测读取层是两条独立链路**，改动数据源前必须先分清要改哪一层：

| 链路 | 位置 | 性质 |
|------|------|------|
| A 取数层 | `apps/quant/data/`（router → registry → providers） | 实时抓取，不落库，供前端与 agent 使用 |
| B 入库层 | `apps/server/src/workers/sync-worker/pipes/` | cron 拉取后写入 PostgreSQL |
| C 回测读取层 | `apps/quant/data_loader.load_kline` | 只查 `bar1d_adj` 表 |

完整链路：sync-worker → quant `/api/v1/data/kline` → PostgreSQL → `load_kline` → 回测引擎。

### 切换数据源的两条路径

- **切取数层**：只需改两处 —— `data/registry.py` 的 `_PROVIDER_CLASSES`（注册 provider 类）与 `_CAPABILITY_PRIORITY`（决定降级链顺序）。新 provider 放 `data/providers/<name>/provider.py`，实现 `data/base.py` 的 `MarketProvider` 协议。验证用 `GET /api/v1/data/sources` 与 `GET /api/v1/data/kline?symbol=...&source=<name>`。
- **切回测数据源**：必须改入库管道（`pipes/kline-1d.ts` 中 `source` 硬编码为 `tencent`）、重建历史数据，并做新旧源双跑比对后再上生产。

### 数据源铁律

- 优先级：mootdx（TCP，不封 IP）> 腾讯（HTTP GBK，不封 IP）> 新浪 / 巨潮 / 同花顺 > 东财（有风控会封 IP，仅用于其独有数据）。
- 东财必须走统一的 `em_get()` 串行限流，禁止直接 `requests.get`。
- **同一条降级链内不得混用不同复权口径**；`kline-1d.ts` 硬编码 `source=tencent` 正是为防止降级污染口径。
- `load_kline` 的输出契约（`time` 索引 + `open/high/low/close/volume/amount/indicators`）不可更改，否则回测、选股、指标三处会同时失效。

### A 股回测可信度缺口（回测或换源前必查）

复权 PIT 化（现用 `qfq` 前复权，存在前视偏差）、停牌标记、涨跌停成交判定。另注意 baostock 不支持北交所。

## 回测服务（apps/quant）

- 框架为 akquant（`pyproject.toml` 依赖 `akquant>=0.3.22`）。
- 策略注册表在 `strategies/__init__.py`（`ma_cross` / `rsi` / `macd` / `bollinger`）；`main.py` 的 `_apply_params` 通过 `type()` 子类化覆盖类属性。
- `engine.run(df, strategy, ...)` 的 `**kwargs` 会透传给 akquant 的 `run_backtest`，故无需改动 `engine.py` 即可传入 `strategy_source` / `strategy_loader`。
- akquant 的 `python_plain` loader **只接受文件路径，不接受源码字符串**（传 bytes 会 TypeError），动态模块名带 uuid 后缀。
- 已知缺陷：`POST /api/v1/backtests/run` 为同步函数且**没有 try/except**（同文件其他端点都有）；`server/src/api/backtests.ts` 的 fetch **没有 AbortSignal**；nginx `proxy_read_timeout 120s`，超时返回 HTML 504 会导致前端解析失败。

## 已确立结论（勿重复论证）

- akquant 策略**无法平滑迁移到 QMT / PTrade**：大 QMT 是 Python 3.6.8 + GBK + `ContextInfo` 的封闭沙箱，MiniQMT 没有回测引擎，两者官方声明不兼容；PTrade 各券商版本 API 也不一致。
- 研究/执行分离的正确做法是**交换数据契约而非交换代码**：研究侧产出 `target_weights`（date / symbol / target_weight），执行侧只保留平台相关的下单薄壳。
- 前端「编写 Python 并运行策略」目前缺三样：编辑器依赖（web 端无 monaco / codemirror 等）、源码到可运行策略的通路、能承载崩溃与超时的执行边界。

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
