# 术语表（glossary）

> ai-trader 中高频出现的领域词、架构词与平台专有词，按主题分组。
> 每组骨架：**术语 / 英文或缩写 / 释义 / 位置**。
> 内容全部取自仓库既有事实（[AGENTS.md](../AGENTS.md)、[docs/](./README.md)、`apps/quant/`、`apps/server/`），不含推测。
> 返回导航：[docs/README.md](./README.md)。

## 1. 架构与模块

| 术语 | 英文 / 缩写 | 释义 | 位置 |
|---|---|---|---|
| monorepo | — | pnpm 工作区单仓多包，四个应用模块 + 一个数据库 + 一套日志栈 | `apps/`、`packages/`（[architecture.md:7-21](file:///Users/wukailin/Documents/study/ai-trader/docs/architecture.md#L7-L21)） |
| 前端 | web | React + Vite + TanStack Router + Astryx，经 nginx 托管 | `apps/web`（[README.md:11](file:///Users/wukailin/Documents/study/ai-trader/docs/README.md#L11)） |
| API | server | Hono + Drizzle，含 sync-worker / feature-worker 定时任务 | `apps/server`（[AGENTS.md](../AGENTS.md)） |
| 回测服务 | quant | Python FastAPI + akquant | `apps/quant`（[AGENTS.md](../AGENTS.md)） |
| 数据同步 Worker | worker / sync-worker | 定时（cron）拉取数据写入 PostgreSQL | `apps/server/src/workers/`（[architecture.md:56](file:///Users/wukailin/Documents/study/ai-trader/docs/architecture.md#L56)） |
| 日志栈 | Alloy → Loki → Grafana | 采集栈，统一收集容器日志与 nginx 访问日志 | `docker/`（[architecture.md:99-116](file:///Users/wukailin/Documents/study/ai-trader/docs/architecture.md#L99-L116)） |

## 2. 三条数据链路

| 术语 | 英文 / 缩写 | 释义 | 位置 |
|---|---|---|---|
| A 取数层 | — | 实时抓取，不落库，供前端与 agent 使用 | `apps/quant/data/`（[AGENTS.md](../AGENTS.md)） |
| B 入库层 | — | cron 拉取后写入 PostgreSQL 的管道 | `apps/server/src/workers/sync-worker/pipes/`（[AGENTS.md](../AGENTS.md)） |
| C 回测读取层 | — | 只读库内复权视图/表函数，回测引擎唯一数据入口 | `apps/quant/data_loader.load_kline`（[AGENTS.md](../AGENTS.md)） |
| 完整链路 | — | `sync-worker → quant /api/v1/data/kline → PostgreSQL → load_kline → 回测引擎` | （[AGENTS.md](../AGENTS.md)） |

## 3. 复权与 PIT 模型

| 术语 | 英文 / 缩写 | 释义 | 位置 |
|---|---|---|---|
| PIT | Point-In-Time | 时点一致：只用该历史时刻**已知**的信息，消除前视偏差 | （[README.md:77](file:///Users/wukailin/Documents/study/ai-trader/docs/README.md#L77)） |
| as_of | — | 回测读取指定的「站在该历史时刻」的时间轴；`None` 时取最新快照 | [data_loader.py:36-40](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data_loader.py#L36-L40) |
| known_at | — | `adj_factor` 快照的已知时刻，append-only；PIT 按 `known_at <= as_of` 取快照 | （[README.md:69](file:///Users/wukailin/Documents/study/ai-trader/docs/README.md#L69)） |
| 前复权 | qfq | 锚定最新交易日，历史段会被新分红反复重锚；仅供展示，禁止用于回测 | （[invariants.md:81-87](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L81-L87)） |
| 后复权 | hfq | 锚定上市首日、不改写历史价位，历史序列不随未来事件变化；回测默认口径 | （[invariants.md:81-87](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L81-L87)） |
| 分段仿射模型 | — | `adj_factor` 的复权算法：qfq 用 `qfq_ratio·raw + qfq_offset`，hfq 用 `scale·qfq + hfq_base` | （[README.md:66-74](file:///Users/wukailin/Documents/study/ai-trader/docs/README.md#L66-L74)） |
| 原始价基表 | `bar1d_raw` | 存储原始价（`adjust=none`）的基表 | （[data-pipeline.md:90-98](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L90-L98)） |
| 前复权视图 | `bar1d_qfq` | 由 `bar1d_raw` + `adj_factor` 派生的前复权视图 | （[data-pipeline.md:90-98](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L90-L98)） |
| 后复权视图 | `bar1d_hfq` | 由 `bar1d_raw` + `adj_factor` 派生的后复权视图 | （[data-pipeline.md:90-98](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L90-L98)） |
| as-of 表函数 | `bar1d_qfq_at` / `bar1d_hfq_at` | 传 `as_of` 时改走的历史复权快照表函数 | （[data-pipeline.md:96-100](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L96-L100)） |
| 复权因子表 | `adj_factor` | append-only、带 `known_at` 的复权因子快照表 | （[README.md:69](file:///Users/wukailin/Documents/study/ai-trader/docs/README.md#L69)） |
| 前视偏差 | look-ahead bias | 回测用到「当时尚未发生」的信息（如未来复权因子、未来价） | （[invariants.md:104-106](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L104-L106)） |
| 数据读取入口 | `load_kline` | C 回测读取层核心函数，输出契约固定 | [data_loader.py:20-29](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data_loader.py#L20-L29) |
| 原始价前收 | `load_raw_close` | 用于涨跌停判定的原始价收盘序列（不能用后复权价近似） | （[invariants.md:146](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L146)） |

## 4. 取数层（A 层）

| 术语 | 英文 / 缩写 | 释义 | 位置 |
|---|---|---|---|
| 取数协议 | `MarketProvider` | 各数据源统一实现的协议；调用方只面向该协议编程 | `apps/quant/data/base.py`（[data-pipeline.md:42](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L42)） |
| 能力常量 | capability | 端点的能力标识，如 `CAPABILITY_KLINE` / `CAPABILITY_QUOTE` / `CAPABILITY_TRANSACTION` / `CAPABILITY_ADJUST_FACTOR` 及信号/资金/筹码层各项 | `apps/quant/data/base.py`（[data-pipeline.md:58](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L58)） |
| 注册表 | registry | 取数层的路由 / 降级唯一配置入口 | `apps/quant/data/registry.py`（[invariants.md:122-128](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L122-L128)） |
| 降级链 | fallback chain | 同一能力的多源有序列表，按顺序依次调用，全失败才抛最后一个异常 | `registry.call_with_fallback`（[data-pipeline.md:152-164](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L152-L164)） |
| 独有单源 | — | 仅一个源提供的能力（无备胎），如东财/同花顺的信号/资金/筹码层 | （[data/README.md:275-280](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L275-L280)） |
| 东财串行限流 | `em_get` / `_em_get` | 东财唯一请求入口：统一 UA + 串行限流 + 内建重试 | `apps/quant/data/providers/eastmoney/provider.py`（[data/README.md:284-287](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L284-L287)） |
| 熔断 | circuit breaker | 连续失败达阈值（5）即跳闸，冷却期内东财请求快速失败上抛 | （[data/README.md:287](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L287)） |
| 锁外退避 | — | 重试退避睡眠放在串行锁之外，避免 head-of-line blocking 雪崩 | （[data/README.md:286](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L286)） |
| 延迟行情主机 | `push2delay` | 东财行情类端点统一走的主机（约 15 分钟延迟，更稳） | （[invariants.md:40-46](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L40-L46)） |
| 历史行情主机 | `push2his` | 东财历史 K 线 / 日线资金流专用主机 | （[data/README.md:289](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L289)） |
| 实时行情主机 | `push2` | 东财实时行情主机（并发下易 `RemoteDisconnected`，行情类不用） | （[invariants.md:40-46](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L40-L46)） |

## 5. 回测与策略

| 术语 | 英文 / 缩写 | 释义 | 位置 |
|---|---|---|---|
| 回测框架 | akquant | 回测引擎依赖，`pyproject.toml` 依赖 `akquant>=0.3.22` | `apps/quant/`（[AGENTS.md](../AGENTS.md)） |
| 策略注册表 | — | 内置策略集合：`ma_cross` / `rsi` / `macd` / `bollinger` | `apps/quant/strategies/__init__.py`（[AGENTS.md](../AGENTS.md)） |
| python_plain loader | — | akquant 的纯 Python 策略加载器，**只接受文件路径**（传 bytes 会 TypeError），动态模块名带 uuid 后缀 | `apps/quant/`（[AGENTS.md](../AGENTS.md)） |
| 目标权重契约 | `target_weights` | 研究侧产出、执行侧消费的数据契约（date / symbol / target_weight） | （[AGENTS.md](../AGENTS.md)） |
| 大 QMT / MiniQMT | QMT | 券商交易终端：大 QMT 为 Python 3.6.8 + GBK + `ContextInfo` 封闭沙箱，MiniQMT 无回测引擎 | （[AGENTS.md](../AGENTS.md)） |
| PTrade | — | 券商交易平台，各券商版本 API 不一致 | （[AGENTS.md](../AGENTS.md)） |

## 6. 定时任务与可观测性

| 术语 | 英文 / 缩写 | 释义 | 位置 |
|---|---|---|---|
| 任务记录表 | `job_run` | 任务执行记录表，**单数**；写成 `job_runs` 会报 `relation does not exist` | `apps/server/src/db/schema/ops.ts`（[AGENTS.md](../AGENTS.md)） |
| 僵尸任务 | stale run | 超过 `STALE_RUN_MS` 仍「在跑」的记录，被清理标记 | （[AGENTS.md](../AGENTS.md)） |
| 僵尸阈值 | `STALE_RUN_MS = 3h` | 僵尸判定窗口，且以 `startedAt` 判活 | （[AGENTS.md](../AGENTS.md)） |
| 非正常结束标记 | interrupted (stale / worker restart / server restart) | 三种来源不同的中断标记，排查前先分清来源 | （[AGENTS.md](../AGENTS.md)） |
| 定时任务上下文 | `wrapJob` | 为定时任务建追踪上下文（`source=scheduled|manual`） | `apps/server/src/lib/`（[AGENTS.md](../AGENTS.md)） |
| 全链路追踪 | AsyncLocalStorage | 贯穿 HTTP 入口与定时任务的上下文传播机制 | `apps/server/src/lib/request-context.ts`（[AGENTS.md](../AGENTS.md)） |
| 追踪标识 | `request_id` / `job_run_id` | 透传到 quant 的请求头（`X-Request-Id` / `X-Job-Run-Id`），归集接口与任务日志 | （[AGENTS.md](../AGENTS.md)） |
| 结构化元数据 | structured metadata | Loki 存储高基数字段的方式（不做 label，防索引爆炸） | （[AGENTS.md](../AGENTS.md)） |
| 日志库 | pino | 日志库，生产 JSON、开发 pino-pretty | `apps/server/src/lib/logger.ts`（[AGENTS.md](../AGENTS.md)） |
| 服务器推送事件 | SSE | AI Chat 流式响应，nginx 需 `proxy_buffering off` | `docker/nginx.conf`（[architecture.md:73](file:///Users/wukailin/Documents/study/ai-trader/docs/architecture.md#L73)） |
| 分区维护 | `partition-maint` | 巡检 `bar1d_raw` 年度分区的定时任务 | （[data-pipeline.md:79](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L79)） |
