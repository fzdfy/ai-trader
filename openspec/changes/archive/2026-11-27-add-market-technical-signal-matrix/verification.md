# Verification

## Environment

- 日期：2026-11-26（验收证据生成）；2026-11-27（收口复核）
- 工作区：`/Users/dakai/Documents/study/ai/ai-trader`
- 分支：`main`
- Docker：server、worker、quant、nginx、PostgreSQL 均在本地运行
- 浏览器：真实 Better Auth 会话，生产构建 `http://localhost:9180`
- Visual design: required；使用已确认的
  `live-latest-signal-integration-v1` 探索稿作为视觉基准

## Runtime Data

PostgreSQL `technical_signal_snapshot` 当前包含 5359 个对象：

| 对象 | 数量 | 业务日期 |
|---|---:|---|
| 大盘 | 1 | 2026-11-24 |
| 黄金 XAU/USD | 1 | 2026-11-26 |
| 行业板块 | 496 | 2026-11-26 |
| 概念板块 | 554 | 2026-11-26 |
| 个股 | 4307 | 2026-11-25 |

Worker 实测：

- `technical-signals-market`：2/2 成功，2 个低质量快照。
- `technical-signals-boards`：1050/1050 成功，因宏观和资金上下文不足均为低质量。
- `technical-signals-stocks`：5580 个对象中 4307 成功、1273 因数据库无历史 K 线失败；
  已成功快照未回滚，页面使用可用快照并明确展示缺失/低置信状态。
- 个股失败属于数据覆盖限制；`job_run` 因存在 1273 个对象失败而记录为 `failed`。

分层判断实测：

- 技术信号快照使用 `signal-judgment-1.0.0`，市场、黄金和目标板块重算后均已持久化。
- 总判断只使用基础信号、K 线形态和高级模型三个核心层。
- `low-confidence`、`unavailable`、`not-applicable` 不进入方向计数。
- 个股微观结构仅调整置信度，不覆盖核心层方向。
- 生产浏览器已验证总判断、4 个个股层级判断、原层级切换、浅色/深色和 390×844 移动端。

## Automated Checks

| Check | Command | Result |
|---|---|---|
| Web tests | `pnpm --filter @ai-trader/web test` | 120 passed，0 failed |
| Signal catalog tests | `pnpm --filter @ai-trader/signal-catalog test` | 23 passed，0 failed |
| Server tests | `pnpm exec dotenvx run -f .env.local -- pnpm --filter @ai-trader/server test` | 279 passed，51 environment-skipped，0 failed |
| Quant tests | `cd apps/quant && .venv/bin/python -m unittest discover -s tests -p 'test_*.py'` | 81 passed，0 failed |
| Web types | `pnpm --filter @ai-trader/web check-types` | passed |
| Full types | `pnpm check-types` | 3/3 packages passed |
| Lint | `pnpm lint` | 0 errors；53 个仓库既有 warning |
| Web build | `docker compose build nginx` | production build passed |
| Responsive review | Authenticated Chrome at `1440×900` / `390×844` | 总览、板块、个股、黄金均保持原层级顺序，无可见页面级横向溢出 |
| Reduced motion | Production stylesheet inspection | `prefers-reduced-motion` rule present |
| OpenSpec | `pnpm exec openspec validate add-market-technical-signal-matrix --strict` | valid |
| Whitespace | `git diff --check` | passed |

## Visual Evidence

截图索引：
[`live-signal-judgments-production-v1/README.md`](../../../docs/design/prototypes/explorations/screenshots/live-signal-judgments-production-v1/README.md)

截图覆盖：

- `/home/market`
- `/home/market/boards`
- `/home/market/boards/BK0459?type=industry`
- `/home/market/stock`
- `/home/market/stock/002594.SZ`
- `/home/market/gold`
- `/home/market/analysis/002594.SZ`
- 所有页面均覆盖 `1440×900`、`390×844`、浅色和深色。
- 信号诊断页面额外保留滚入矩阵后的 `*-signals.png`。
- 行情总览保留用户指定的底部滚动截图
  `market-light-desktop-bottom-fixed.jpg` 与
  `market-light-mobile-bottom-fixed.jpg`，画面包含 ATR/OBV 信号尾行和
  大类资产轮动模块，底部不再产生额外空白。
- 键盘焦点与证据展开截图：
  `interaction-light-desktop-keyboard-focus.png`、
  `interaction-light-desktop-evidence-expanded.png`。

视觉复核修复：

- 信号“已触发/已失效”不再复用红涨绿跌语义，改为品牌蓝与中性墨色；
  低置信继续使用黄色警示。
- 移动端信号矩阵改为四列紧凑表，直接显示名称、状态、当前值和展开操作；
  证据摘要列隐藏，完整内容保留在展开行。
- 可横向滚动信号区域增加可访问名称和键盘焦点能力。
- 7 个页面在 `390×844` 实测 `documentElement.scrollWidth === clientWidth === 390`。
- 工作台主内容滚动区增加 `overscroll-contain`，并禁止工作台页面由 `body`
  二次滚动；桌面 `1920×1013` 和移动 `390×844` 滚到底后继续 PageDown，
  `window.scrollY` 均为 `0`。

## Acceptance Criteria Evidence

| AC | 证据 | 状态 |
|---|---|---|
| AC-1 | 140 项目录与 40/48/40/12 分布测试 | 已通过 |
| AC-2 | 目录字段、参数快照与规则版本测试 | 已通过 |
| AC-3 | Quant/Server golden fixture 与双时间契约测试 | 已通过 |
| AC-4 | 缺失、低置信、XAU 不适用和代理置信边界测试 | 已通过 |
| AC-5 | 行情总览与板块列表/详情生产截图；技术摘要和 32 项矩阵可见 | 已通过 |
| AC-6 | 个股列表技术摘要、快速详情标签和“查看 44 项证据”入口截图 | 已通过 |
| AC-7 | 个股分析 10/12/10/12 共 44 项矩阵截图 | 已通过 |
| AC-8 | `/home/market/gold` 生产截图，明确 XAU/USD、USD/oz 和量能“不适用” | 已通过 |
| AC-9 | 共享目录/API 测试与页面中的统一 `signal_id`、目录版本 | 已通过 |
| AC-10 | 无验证证据时不展示胜率，只显示“待验证” | 已通过 |
| AC-11 | 部分成功提示、可用信号持续展示和局部重试入口 | 已通过 |
| AC-12 | 键盘焦点、证据展开、明暗主题、桌面/移动截图及无页面级溢出检查 | 已通过 |
| AC-13 | 共享筛选/摘要/持久化契约、总判断与分层判断、Worker 和个股分析透传测试 | 已通过 |
| AC-14 | 有效方向投票、缺失状态排除、个股微观结构不覆盖核心层和确定性重算测试 | 已通过 |

## Layered Judgment Evidence

- 契约：`packages/signal-catalog/test/contracts.test.ts` 验证版本、核心层约束和计数一致性。
- 聚合：`apps/server/src/lib/technical-signals/judgment.test.ts` 验证核心层共识、低置信排除、分歧、证据不足、微观结构辅助和确定性。
- 持久化：`apps/server/src/lib/technical-signals/store.test.ts` 验证合法摘要保留、旧摘要不被推测补写。
- Worker / 个股分析：`technical-signals.test.ts` 与 `stock-analysis.test.ts` 验证摘要写入和 44 项个股层透传。
- Web：`signal-utils.test.ts` 验证按层读取、语义色不混用价格红绿和中文置信度。
- 截图：[`live-signal-judgments-production-v1/README.md`](../../../docs/design/prototypes/explorations/screenshots/live-signal-judgments-production-v1/README.md)。

## Notes and Limitations

- 1273 只个股缺少可计算历史 K 线，未生成本轮个股信号快照；这不影响已成功的
  4307 只个股和其余 1052 个市场/板块/黄金对象。
- 页面级成功态和部分成功态已有生产截图；加载、空和全错误态由组件状态实现与
  已确认探索稿覆盖，本轮没有通过停止生产 API 再制造全错误截图。
- `docs/design/prototypes/explorations/quant-workbench-assistant.html` 未修改。
- 用户已于 2026-11-27 验收通过，并单独确认归档。
