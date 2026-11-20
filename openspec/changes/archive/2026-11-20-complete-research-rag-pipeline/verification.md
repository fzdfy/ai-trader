# 研报 RAG Pipeline 验证报告

日期：2026-11-20  
检索参数版本：`hybrid-keyword-v1`  
视觉确认稿：`docs/design/prototypes/explorations/quant-workbench-research-rag-v1.html`

## 1. 结论

研报元数据 → 队列 → PDF 全文/OCR → 分块 → BGE 向量 → Evidence Search / Agent Top 5 的首批链路已完成并通过真实数据验证。分析页 GET 保持只读，独立的 POST 负责入队；语义异常或空结果会降级关键词。

新闻 RAG：不适用。本变更未生成或使用新闻向量，`news_embedding` 仍不是生产 RAG 路径。

## 2. 验证环境

- PostgreSQL：本地 `aitrader` 数据库。
- quant：本地 FastAPI，writable `REPORTS_DATA_DIR=/private/tmp/ai-trader-reports`。
- worker：独立 `research-worker`，`batchSize=1`，全局并发 1。
- 真实 PDF：18 个文件，总计约 33 MB。

## 3. 自动化检查

| 检查 | 结果 |
|---|---|
| server 主测试 | 155 tests：154 passed，1 skipped（workflow schema 因 `WORKFLOW_DB_TESTS` 门禁跳过） |
| server workflow schema 补测 | 1 passed |
| workflow service / worker integration | 2 skipped：要求隔离数据库名 `workflow_check` |
| web 测试 | 43 passed |
| quant unittest | 18 passed |
| server / web TypeScript | passed |
| repo lint | 0 errors，36 个既有 warnings |
| Vite production build | passed；仅保留既有大 chunk warning |
| OpenSpec | `openspec validate complete-research-rag-pipeline --strict` passed |

主要命令：

```bash
cd apps/server
ADMIN_DB_TESTS=1 DATABASE_URL=postgres://ai-trader:aitrader123@localhost:5432/aitrader pnpm test

cd apps/web
node --test --experimental-strip-types src/**/*.test.ts
../../node_modules/.bin/vite build

cd apps/quant
uv run python -m unittest discover -s tests -q

cd /Users/fengyunpeng/Documents/study/ai-trader
./node_modules/.bin/oxlint .
./node_modules/.bin/openspec validate complete-research-rag-pipeline --strict
```

## 4. 真实全文与向量

| 标的 | 最近 30 天研报 | 成功全文 | 失败 | 页数 | 分块 | 向量 |
|---|---:|---:|---:|---:|---:|---:|
| `002594.SZ` 比亚迪 | 7 | 7 | 0 | 27 | 22 | 22 |
| `600519.SH` 贵州茅台 | 11 | 11 | 0 | 48 | 26 | 26 |
| 合计 | 18 | 18 | 0 | 75 | 48 | 48 |

- 队列最终状态：`research-report-index` 共 18 个 job，全部 `completed`。
- 提取时间：比亚迪约 37 秒，茅台约 40 秒，均为串行执行。
- 单篇成功写回页数、全文、分块、embedding 模型和版本；失败会写 `failed + last_error`。

## 5. 失败与恢复证据

首轮真实处理时，本地 quant 未配置可写报表目录，18 个任务均以：

```text
research report extraction failed: [Errno 30] Read-only file system: '/data'
```

失败。worker 将异常交给 pg-boss，队列按指数退避进入 retry；将 quant 的 `REPORTS_DATA_DIR` 指向可写目录并重启 worker 后，18 个任务全部在同一 singleton 链上完成，没有重复分块。

该次真实故障同时验证了：

- handler 失败会抛回 pg-boss，不会被吞掉；
- 失败不会拖垮其他标的；
- worker 重启后可继续处理 retry / pending；
- `pending` 超过 10 分钟的周期巡检有自动化测试覆盖。

## 6. Golden Set

Fixture：`apps/server/src/agent/mastra/fixtures/research-rag-golden-set.json`  
评测器：`apps/server/src/services/research-evidence-evaluation.ts`  
脚本：`apps/server/scripts/evaluate-research-rag.ts`

数据分布：比亚迪 11 条，贵州茅台 10 条，共 21 条；覆盖历史 `asOf`、跨标的 forbidden source、引用字段和关键词回退。

| 场景 | Top 8 通过 | Recall | 模式 |
|---|---:|---:|---|
| 全文入库前 / 强制向量不可用 | 21/21 | 1.000 | keyword 21/21 |
| 全文和 48 个向量入库后 | 19/21 | 0.905 | semantic 21/21 |
| 入库后再次强制向量不可用 | 21/21 | 1.000 | keyword 21/21 |

语义基线未进入 Top 8 的 2 个案例：`moutai-sell-to-c`、`moutai-growth-headroom`。

按已确认决策，本轮不设置硬相似度阈值。后续只有在扩大样本、复核标签和参数稳定后再校准阈值。

## 7. Evidence Search 与 Agent

真实语义查询示例：

- `002594.SZ` / “海外本地化和利润弹性”：返回 `AP202611021831322093`，第 1–3 页，相似度约 0.539。
- `600519.SH` / “市场化改革和渠道价格体系”：Agent 工具返回 5 条 Top 5，包含来源 ID、标题、日期、页码和相似度。

Agent output schema 已加入 `sourceId`、`sectionTitle` 和 `similarity`，回答契约要求引用实际证据，证据不足时明确说明。

## 8. 前端与视觉验收

生产页面截图：

- [待索引 · 浅色桌面](../../../../docs/design/prototypes/explorations/screenshots/research-rag-production/pending-light-desktop.png)
- [待索引 · 浅色移动端](../../../../docs/design/prototypes/explorations/screenshots/research-rag-production/pending-light-mobile.png)
- [待索引 · 深色桌面](../../../../docs/design/prototypes/explorations/screenshots/research-rag-production/pending-dark-desktop.png)
- [索引中检索空态](../../../../docs/design/prototypes/explorations/screenshots/research-rag-production/evidence-empty-light-desktop.png)

浏览器检查：无脚本异常；6 个 `ERR_ABORTED` 均为切换页面时主动中止轮询请求，已记录在截图目录 `report.json`。

## 9. 已知限制

- 语义检索当前 19/21 进入 Top 8，低于关键词精确短语基线；这是待优化项，不是隐藏失败。
- 同一研报可能因多个相关分块占用 Top 8 名额；后续应根据 Golden Set 决定是否限制每篇最多返回的 chunk 数。
- 本地非容器运行必须配置可写 `REPORTS_DATA_DIR`；生产容器继续使用共享 `reports-data:/data/reports`。
- 新闻 RAG 未启用，不包含在本次完成声明中。

## 10. 独立审查修复

归档前独立审查发现并已修复：

- 零研报标的通过 `sync_cursor` 持久化元数据观察时间，成功后进入 `none` 终态，不再无限轮询；
- `/index-window` 提交失败会显示错误并提供“重试提交”；
- orphaned 巡检跳过仍有 `created/retry/active` job 的 pending 文档；
- Evidence Search 和 Agent 不再把只有元数据、没有页码/原文的行当作可引用证据；
- “已提取”判定要求当前版本的所有分块都包含有效向量；
- 活动状态点增加 reduced-motion 处理；
- Golden Set 的预期页码必须来自预期来源，默认运行只记录基线，不强制设置硬阈值。

## 11. 回滚

- 代码回滚：撤回本 change 的队列、worker、API、检索和前端提交。
- 运行回滚：停止 `research-worker`，取消 / 删除 `research-report-index` 中未执行 job。
- 数据保留：`research_report` 元数据可保留；如需恢复到此前的“仅元数据”状态，删除对应 `research_report_document` 与其 cascade 分块，并清理 `reports-data` 中的 PDF。
- 本 change 未新增数据库迁移；表结构由既有 `0034_stock_analysis_rag.sql` 提供。
