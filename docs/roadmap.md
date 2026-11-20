# 路线图（roadmap）

> ai-trader 的**已完成 / 进行中 / 待办**汇总。本文件只搬既有事实与文档已明确指出的方向，不含新规划的推测。
> 返回导航：[docs/README.md](./README.md)。

## 1. 已完成

| 事项 | 说明 | 状态依据 |
|---|---|---|
| 回测链接入 PIT | `BacktestRequest.asOf → load_kline(..., as_of=) → bar1d_*_at` 表函数按 `known_at <= asOf` 取历史复权快照 | 「回测链已接 PIT」[AGENTS.md](../AGENTS.md)、[data-pipeline.md:186](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L186) |
| 东财 `em_get` 防雪崩加固 | 串行锁只覆盖单次请求、重试退避在锁外、连续失败达阈值熔断 | 「东财加固后」[AGENTS.md](../AGENTS.md)、[AGENTS.md](../AGENTS.md) |
| nginx 长耗时接口超时调至 300s | 原 `120s` 会返回 HTML 504 致前端解析失败，现为 300s | [architecture.md:74](file:///Users/wukailin/Documents/study/ai-trader/docs/architecture.md#L74)、[decisions.md DEC-15](./decisions.md#dec-15-nginx-长耗时接口超时调至-300s) |
| 三条数据链与铁律文档化 | A/B/C 三链路、INV-1..14 铁律成文 | [invariants.md](./invariants.md)、[data-pipeline.md](./data-pipeline.md) |
| 取数层可插拔切换落地 | 只改注册表两处即可切源 | [decisions.md DEC-2](./decisions.md#dec-2-切取数层只改注册表两处) |
| 入库按标的固定源 | 北交所 `.BJ` → 东财，沪深 → 腾讯，禁止静默降级 | [decisions.md DEC-4](./decisions.md#dec-4-入库源按标的固定禁止静默降级)、[invariants.md:77](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L77) |
| 研报 RAG 首批链路 | 独立 research-worker + pg-boss，完成真实全文、分块、BGE 向量、关键词降级、Evidence Search、Agent Top 5 和 21 条 Golden Set | [验证报告](../openspec/changes/complete-research-rag-pipeline/verification.md)、[RAG 标准](./standards/rag.md) |

## 2. 进行中 / 待观察

| 事项 | 说明 | 状态依据 |
|---|---|---|
| kline-1d 全市场同步恢复观察 | 东财加固后**待观察**下一交易日 15:10 那轮是否恢复（正常约 46 分钟跑完，异常时 >3h） | [AGENTS.md](../AGENTS.md)、[issues.md ISS-12](./issues.md#iss-12-东财雪崩拖垮-quant) |
| `adj_factor` 多版本累积 | 目前仅 1 个快照 `2026-10-01`，需每日 `adj-factor` 同步累积出多版本后 PIT 才有区分度 | [AGENTS.md](../AGENTS.md)、[issues.md ISS-6](./issues.md#iss-6-adj_factor-仅单快照) |

## 3. 待办

### 3.1 稳定性与可观测性

| 事项 | 说明 | 状态依据 |
|---|---|---|
| 僵尸任务改心跳判活 | 引入心跳（`updateProgress` 顺带续期）后按「最近心跳」判活，替代以 `startedAt` 判活 | 「改进方向是引入心跳」[AGENTS.md](../AGENTS.md)、[issues.md ISS-4](./issues.md#iss-4-僵尸任务以-startedat-判活) |
| 修复 worker 启动清理跨进程误杀 | 避免 worker 启动清理误杀 server 手动同步正在跑的子任务 | [AGENTS.md](../AGENTS.md)、[issues.md ISS-5](./issues.md#iss-5-worker-启动清理跨进程误杀) |
| 回测执行端点加异常兜底 | `POST /api/v1/backtests/run` 补 `try/except` | [AGENTS.md](../AGENTS.md)、[issues.md ISS-1](./issues.md#iss-1-回测执行端点无异常兜底) |
| 前端回测请求补中止信号 | `backtests.ts` 的 fetch 补 `AbortSignal` | [AGENTS.md](../AGENTS.md)、[issues.md ISS-2](./issues.md#iss-2-前端回测请求无中止信号) |

### 3.2 回测可信度缺口

| 事项 | 说明 | 状态依据 |
|---|---|---|
| 停牌标记 | 回测读取链缺停牌标记 | [AGENTS.md](../AGENTS.md)、[issues.md ISS-7](./issues.md#iss-7-停牌标记缺失) |
| 涨跌停成交判定 | 缺涨跌停成交判定；应基于原始价前收（`load_raw_close`） | [AGENTS.md](../AGENTS.md)、[invariants.md:146](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L146)、[issues.md ISS-8](./issues.md#iss-8-涨跌停成交判定缺失) |

### 3.3 能力建设

| 事项 | 说明 | 状态依据 |
|---|---|---|
| 前端「编写 Python 并运行策略」 | 缺三样：编辑器依赖（web 端无 monaco / codemirror 等）、源码到可运行策略的通路、能承载崩溃与超时的执行边界 | [AGENTS.md](../AGENTS.md)、[decisions.md DEC-13](./decisions.md#dec-13-前端编写-python-并运行策略暂不实现) |
| 研究与执行分离：`target_weights` 契约落地 | 研究侧产出 `target_weights`（date / symbol / target_weight），执行侧只保留平台相关下单薄壳 | [AGENTS.md](../AGENTS.md)、[decisions.md DEC-12](./decisions.md#dec-12-研究与执行分离用交换数据契约) |
| 实装 `kline-1m` / `gap-detect` | 当前为未实现空壳，`enabled: false` | [data-pipeline.md:79](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L79)、[issues.md ISS-11](./issues.md#iss-11-未实现空壳任务) |
| 信号/资金/筹码层备胎 | 现为东财/同花顺单源、无备胎 | [data-pipeline.md:164-166](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L164-L166)、[issues.md ISS-13](./issues.md#iss-13-信号资金筹码层东财单源无备胎) |
| 研报语义召回优化 | 语义 Golden Set 当前 19/21 进入 Top 8；扩大样本后再评估报告级去重、rerank 和相似度阈值。新闻 RAG 暂缓 | [RAG 标准](./standards/rag.md)、[issues.md ISS-16](./issues.md#iss-16-研报-rag-已有首批数据但语义召回仍需优化)、[验证报告](../openspec/changes/complete-research-rag-pipeline/verification.md) |
