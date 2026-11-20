# 已知缺陷与技术债（issues）

> 本文件汇总 ai-trader 的**已知缺陷、已知缺口与技术债**，供遇到怪现象时先查这里。
> 每条骨架：**类别 / 现象 / 位置 / 影响 / 规避或处置 / 证据来源**。
> 内容全部取自仓库既有事实（[AGENTS.md](../AGENTS.md)、[docs/](./README.md)、`apps/quant/`、`apps/server/`），不含推测。
> 返回导航：[docs/README.md](./README.md)。

## 索引

| 编号 | 类别 | 标题 |
|---|---|---|
| [ISS-1](#iss-1-回测执行端点无异常兜底) | 缺陷 | `POST /api/v1/backtests/run` 为同步函数且无 `try/except` |
| [ISS-2](#iss-2-前端回测请求无中止信号) | 缺陷 | `backtests.ts` 的 fetch 没有 `AbortSignal` |
| [ISS-3](#iss-3-nginx-超时曾致前端解析失败) | 缺陷（已缓解） | nginx 超时返回 HTML 504 致前端解析失败 |
| [ISS-4](#iss-4-僵尸任务以-startedat-判活) | 技术债 | 僵尸任务以 `startedAt` 判活，长任务被误判 |
| [ISS-5](#iss-5-worker-启动清理跨进程误杀) | 缺陷 | worker 启动清理误杀 server 手动同步子任务 |
| [ISS-6](#iss-6-adj_factor-仅单快照) | 数据缺口 | `adj_factor` 目前仅 1 个快照，PIT 无区分度 |
| [ISS-7](#iss-7-停牌标记缺失) | 数据缺口 | 停牌标记缺口 |
| [ISS-8](#iss-8-涨跌停成交判定缺失) | 数据缺口 | 涨跌停成交判定缺口 |
| [ISS-9](#iss-9-baostock-不支持北交所) | 数据缺口 | baostock 不支持北交所 |
| [ISS-10](#iss-10-akquant-loader-只接受文件路径) | 约束/缺陷 | `python_plain` loader 只接受文件路径 |
| [ISS-11](#iss-11-未实现空壳任务) | 技术债 | `kline-1m` / `gap-detect` 为未实现空壳 |
| [ISS-12](#iss-12-东财雪崩拖垮-quant) | 缺陷 | 东财雪崩拖垮 quant，kline-1d 整批超时 |
| [ISS-13](#iss-13-信号资金筹码层东财单源无备胎) | 技术债/风险 | 信号/资金/筹码层东财单源、无备胎 |
| [ISS-14](#iss-14-job_run-表名单数易误写) | 易错点 | 任务记录表名是单数 `job_run` |
| [ISS-15](#iss-15-文档与代码事实漂移) | 技术债 | 文档记载与代码实现存在漂移 |
| [ISS-16](#iss-16-研报-rag-已有首批数据但语义召回仍需优化) | 质量/技术债 | 研报 RAG 已有首批全文向量，语义 Top 8 召回仍需优化 |

---

## ISS-1 回测执行端点无异常兜底

- **类别**：缺陷。
- **现象**：`POST /api/v1/backtests/run` 为同步函数且**没有 `try/except`**（同文件其他端点都有）。
- **位置**：`apps/quant/main.py`。
- **影响**：策略执行期抛错会直接冒泡，缺少统一的错误响应。
- **规避或处置**：待修，见 [roadmap.md](./roadmap.md)。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## ISS-2 前端回测请求无中止信号

- **类别**：缺陷。
- **现象**：`server/src/api/backtests.ts` 的 fetch **没有 `AbortSignal`**。
- **位置**：`apps/server/src/api/backtests.ts`。
- **影响**：上游长时间未返回时前端无法主动中止，只能被动等待/超时。
- **规避或处置**：待修，见 [roadmap.md](./roadmap.md)。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## ISS-3 nginx 超时曾致前端解析失败

- **类别**：缺陷（已在 nginx 配置中缓解）。
- **现象**：nginx `proxy_read_timeout 120s` 时，超时返回 HTML 504 会导致前端解析失败。
- **位置**：`docker/nginx.conf`；`apps/server/src/api/backtests.ts`（消费方）。
- **影响**：长耗时接口（选股等 quant 全市场打分 40–60s）在超时窗口被截断时，前端拿到 HTML 而非 JSON，解析报错。
- **规避或处置**：当前配置已调至 `proxy_read_timeout 300s` / `proxy_send_timeout 300s`（见 [decisions.md DEC-15](./decisions.md#dec-15-nginx-长耗时接口超时调至-300s)）；`server` 侧 fetch 缺 `AbortSignal` 的问题仍待修（见 ISS-2）。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[architecture.md:74](file:///Users/wukailin/Documents/study/ai-trader/docs/architecture.md#L74)。

---

## ISS-4 僵尸任务以 startedAt 判活

- **类别**：技术债。
- **现象**：僵尸阈值 `STALE_RUN_MS = 3h`，且**以 `startedAt` 判活**：真在跑的长任务会被误判僵尸、DB 行改判 failed（进程不受影响，仍继续跑）。
- **位置**：`apps/server/src/workers/sync-worker/runner.ts`（`cleanupStaleRuns`）。
- **影响**：DB 记录与真实运行状态不一致，排障时易误判；`cleanupStaleRuns` 由 worker 每 10 分钟 + 各查询/触发接口前调用。
- **规避或处置**：改进方向是引入心跳（`updateProgress` 顺带续期）后按「最近心跳」判活，见 [roadmap.md](./roadmap.md)。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## ISS-5 worker 启动清理跨进程误杀

- **类别**：缺陷。
- **现象**：worker 启动清理会把 **server 手动同步正在跑的子任务**一并标 failed。
- **位置**：`apps/server/src/workers/sync-worker/runner.ts`（`cleanupInterruptedJobs`）。
- **影响**：跨进程误杀，DB 记录与真实运行状态不一致。
- **规避或处置**：待修，见 [roadmap.md](./roadmap.md)。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## ISS-6 adj_factor 仅单快照

- **类别**：数据缺口（影响回测可信度）。
- **现象**：`adj_factor` 目前仅 1 个快照 `2026-10-01`，早于该时刻无版本可选、等价于不复权。
- **位置**：`apps/quant/data_loader.py`（`as_of` 路径）；`adj_factor` 表。
- **影响**：PIT 复权在 `as_of` 早于该时刻时无区分度，需每日 `adj-factor` 同步累积出多版本后才有意义。
- **规避或处置**：依赖每日 `adj-factor` 同步累积多版本，见 [roadmap.md](./roadmap.md)。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:107](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L107)、[decisions.md DEC-6](./decisions.md#dec-6-回测读取接入-pit)。

---

## ISS-7 停牌标记缺失

- **类别**：数据缺口（影响回测可信度）。
- **现象**：停牌标记为已知缺口。
- **位置**：`apps/quant/`（回测读取链）。
- **影响**：回测无法识别停牌区间，成交判定失真。
- **规避或处置**：回测或换源前必查；见 [roadmap.md](./roadmap.md)。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[data-pipeline.md:181-188](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L181-L188)。

---

## ISS-8 涨跌停成交判定缺失

- **类别**：数据缺口（影响回测可信度）。
- **现象**：涨跌停成交判定为已知缺口；涨跌停判定应基于**原始价**前收（`load_raw_close`），不能用后复权价近似。
- **位置**：`apps/quant/data_loader.py`（`load_raw_close`、`as_of`）；`apps/quant/main.py`（`BacktestRequest`）。
- **影响**：忽略涨跌停约束会高估可成交性，回测结果不可信。
- **规避或处置**：待补涨跌停成交判定；见 [roadmap.md](./roadmap.md)。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:142-147](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L142-L147)。

---

## ISS-9 baostock 不支持北交所

- **类别**：数据缺口。
- **现象**：baostock 不支持北交所。
- **位置**：数据源层（涉及北交所标的的取数路径）。
- **影响**：涉及北交所标的时若选 baostock 会静默失败。
- **规避或处置**：涉及北交所标的时勿选 baostock（`kline-1d` 北交所固定走东财，见 [decisions.md DEC-4](./decisions.md#dec-4-入库源按标的固定禁止静默降级)）。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## ISS-10 akquant loader 只接受文件路径

- **类别**：约束 / 缺陷（影响动态策略加载）。
- **现象**：akquant 的 `python_plain` loader **只接受文件路径，不接受源码字符串**（传 bytes 会 TypeError）。
- **位置**：`apps/quant/engine.py`（`strategy_source` / `strategy_loader` 透传路径）。
- **影响**：无法直接把内存中的源码字符串喂给 loader；动态模块名带 uuid 后缀，须落盘为文件。
- **规避或处置**：实现「源码到可运行策略」时须先落盘为文件（与 DEC-13 的缺口相关）。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## ISS-11 未实现空壳任务

- **类别**：技术债。
- **现象**：`kline-1m` / `gap-detect` 为未实现空壳，配置 `enabled: false`。
- **位置**：`apps/server/src/workers/sync-worker/cron-config.ts`。
- **影响**：相关能力尚未落地，仅占位。
- **规避或处置**：见 [roadmap.md](./roadmap.md)。
- **证据来源**：[data-pipeline.md:79](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L79)。

---

## ISS-12 东财雪崩拖垮 quant

- **类别**：缺陷（已加固，待观察）。
- **现象**：2026-09-21 诊断——东财雪崩拖垮 quant 后单标的请求大面积超时，kline-1d 全市场整批耗时 >3h，被 `cleanupStaleRuns` 按阈值误杀（`3056`/`3310` 的 `finished_at - started_at` 精确等于 3h，进度仅 782/5552、833/5553）。
- **位置**：`apps/quant/data/`（东财取数）、`apps/server/src/workers/sync-worker/pipes/kline-1d.ts`、`runner.ts`（`cleanupStaleRuns`）。
- **影响**：整批同步被误判僵尸；与 ISS-4 叠加放大排障难度。kline-1d 全市场（约 5552 只，源固定腾讯）正常约 46 分钟跑完，异常时 >3h。
- **规避或处置**：东财已做加固（见 [decisions.md DEC-8](./decisions.md#dec-8-东财统一-em_get-串行限流--熔断)）；**待观察**下一交易日 15:10 那轮是否恢复。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[data-pipeline.md:81](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L81)。

---

## ISS-13 信号资金筹码层东财单源无备胎

- **类别**：技术债 / 风险。
- **现象**：信号/资金/筹码层多数能力为东财（或同花顺）单源，降级链只有 1 个源、无备胎。
- **位置**：`apps/quant/data/registry.py`（`_CAPABILITY_PRIORITY`）、`apps/quant/data/providers/eastmoney/`。
- **影响**：东财整体被封时这些能力在冷却期内快速失败并 `skip`，属预期内的保护行为，但无替代源。
- **规避或处置**：真正兜底在 server 端——sync 脚本对每类数据 `try/catch` 失败即 `skip` 不中断整轮；热力图等实时页面在 DB 兜底模式跳过成分股、15s 总时限。
- **证据来源**：[data-pipeline.md:164-166](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L164-L166)、[data/README.md:275-293](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L275-L293)。

---

## ISS-14 job_run 表名单数易误写

- **类别**：易错点。
- **现象**：任务记录表名是 `job_run`（**单数**）。
- **位置**：`apps/server/src/db/schema/ops.ts`。
- **影响**：手工查询写成 `job_runs` 会报 `relation "job_runs" does not exist`。
- **规避或处置**：查库 / 写 SQL 统一用 `job_run`（见 [decisions.md](./decisions.md) 相关条目与 [invariants.md INV-11](./invariants.md#inv-11-任务记录表名是单数-job_run)）。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## ISS-15 文档与代码事实漂移

- **类别**：技术债（文档准确性）。
- **现象**：部分文档记载与代码实现不符，已由 [invariants.md](./invariants.md) 校正：
  - `em_get` 熔断冷却时长：文档记 30s，代码实际 `_EM_BREAKER_COOLDOWN = 300.0`（5 分钟）；
  - `kline-1d.ts` 选源：文档记「硬编码 `source=tencent`」，代码已改为按标的选源（`.BJ` → 东财，否则腾讯）。
- **位置**：`apps/quant/data/providers/eastmoney/provider.py`、`apps/server/src/workers/sync-worker/pipes/kline-1d.ts`。
- **影响**：以文档为准会误判行为；排查时以代码为准。
- **规避或处置**：涉及上述两处时以代码为准，详见 [invariants.md:36](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L36)、[invariants.md:77](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L77)。
- **证据来源**：[invariants.md:36](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L36)、[invariants.md:69-77](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L69-L77)。

---

## ISS-16 研报 RAG 已有首批数据但语义召回仍需优化

- **类别**：检索质量 / 技术债。
- **现象**：2026-11-20 首批真实链路已为比亚迪和贵州茅台完成 18 篇 PDF、75 页、48 个分块和 48 个向量；语义检索 Golden Set 为 19/21 进入 Top 8，强制关键词降级为 21/21。
- **位置**：
  - `apps/server/src/services/research-evidence-service.ts`：共享语义 + 关键词检索。
  - `apps/server/src/agent/mastra/tools/research-report-tool.ts`：Agent 研报工具。
  - `apps/server/src/agent/mastra/rag/index.ts`：未被调用的新闻 RAG 残留代码，且查询了不存在的 `news.embedding`。
- **影响**：
  - 研报 Evidence Search 和 Agent 已能返回真实页码与原文，但部分自然语义查询的目标研报未进入 Top 8。
  - 同一研报的多个分块可能占满 Top 8，降低报告级多样性。
  - 新闻尚未生成或使用向量，不属于 RAG 链路。
- **规避或处置**：
  - 运行 `pnpm --filter @ai-trader/server eval:research-rag` 观察语义和关键词基线。
  - 在扩大 Golden Set、复核标签后，再决定每篇研报 chunk 上限、相似度阈值和 rerank 策略。
  - 新闻 RAG 暂不启用；长期边界见 [RAG 标准](./standards/rag.md)。
- **证据来源**：[研报 RAG 验证报告](../openspec/changes/archive/2026-11-20-complete-research-rag-pipeline/verification.md)、`research-report` Golden Set fixture、检索服务与 Agent 工具。
