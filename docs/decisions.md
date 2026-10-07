# 决策记录（decisions / ADR）

> 本文件把 [AGENTS.md](../AGENTS.md) 中「已确立结论（勿重复论证）」与散落在各文档里的**已决技术决策**集中编号为 DEC-1..N，供想重复论证某个结论前先对照。
> 每条骨架：**状态 / 背景 / 决策 / 理由 / 影响 / 证据来源**。
> 内容全部取自仓库既有事实（[AGENTS.md](../AGENTS.md)、[docs/](./README.md)、`apps/quant/data/`），不含推测。
> 返回导航：[docs/README.md](./README.md)。

## 索引

| 编号 | 决策 | 状态 |
|---|---|---|
| [DEC-1](#dec-1-取数层与回测读取层分离) | 取数层与回测读取层分离（A/B/C 三条独立链路） | 已决·勿翻案 |
| [DEC-2](#dec-2-切取数层只改注册表两处) | 切「取数层」只改注册表两处 | 已决·勿翻案 |
| [DEC-3](#dec-3-入库落原始价复权由视图派生) | 入库层落原始价，复权由 `adj-factor` + 视图派生 | 已决·勿翻案 |
| [DEC-4](#dec-4-入库源按标的固定禁止静默降级) | 入库源按标的固定，禁止静默降级 | 已决·勿翻案 |
| [DEC-5](#dec-5-回测默认后复权-hfq) | 回测默认后复权 `hfq`，前复权 `qfq` 仅展示 | 已决·勿翻案 |
| [DEC-6](#dec-6-回测读取接入-pit) | 回测读取接入 PIT（`as_of` → `bar1d_*_at`） | 已决·勿翻案 |
| [DEC-7](#dec-7-load_kline-输出契约固定) | `load_kline` 输出契约固定 | 已决·勿翻案 |
| [DEC-8](#dec-8-东财统一-em_get-串行限流--熔断) | 东财统一 `em_get` 串行限流 + 熔断 | 已决·勿翻案 |
| [DEC-9](#dec-9-东财行情类端点走-push2delay) | 东财行情类端点走 `push2delay` | 已决·勿翻案 |
| [DEC-10](#dec-10-数据源按不封-ip-优先排序) | 数据源按「不封 IP 优先」排序 | 已决·勿翻案 |
| [DEC-11](#dec-11-akquant-策略不迁移-qmt--ptrade) | akquant 策略不迁移 QMT / PTrade | 已确立结论 |
| [DEC-12](#dec-12-研究与执行分离用交换数据契约) | 研究与执行分离用「交换数据契约」 | 已确立结论 |
| [DEC-13](#dec-13-前端编写-python-并运行策略暂不实现) | 前端「编写 Python 并运行策略」暂不实现 | 已确立结论 |
| [DEC-14](#dec-14-日志高基数字段进-structured-metadata) | 日志高基数字段进 structured metadata | 已决·勿翻案 |
| [DEC-15](#dec-15-nginx-长耗时接口超时调至-300s) | nginx 长耗时接口超时调至 300s | 已决·勿翻案 |

---

## DEC-1 取数层与回测读取层分离

- **状态**：已决·勿翻案。
- **背景**：改动数据源前必须先分清要改哪一层，否则会改错链路。
- **决策**：取数层与回测读取层是两条独立链路，落库前后共三条链：A 取数层（实时抓取，不落库，供前端与 agent 使用）、B 入库层（cron 拉取后写入 PostgreSQL）、C 回测读取层（只读库内复权视图/表函数）。
- **理由**：三条链的改动面与风险不同，分层后可独立演进、独立验证。
- **影响**：完整链路为 `sync-worker → quant /api/v1/data/kline → PostgreSQL → load_kline → 回测引擎`。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[data-pipeline.md:7-37](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L7-L37)、[README.md:33-62](file:///Users/wukailin/Documents/study/ai-trader/docs/README.md#L33-L62)。

---

## DEC-2 切取数层只改注册表两处

- **状态**：已决·勿翻案。
- **背景**：取数层需要可插拔地增删 / 切换数据源而不改上层。
- **决策**：切「取数层」只需改 `registry.py` 的两处——`_PROVIDER_CLASSES`（注册 provider 类）与 `_CAPABILITY_PRIORITY`（决定降级链顺序），不得改动 router 或各 provider 实现。
- **理由**：注册表是取数层唯一的路由 / 降级配置入口；调用方只面向 `MarketProvider` 协议编程。
- **影响**：新 provider 放 `data/providers/<name>/provider.py`，实现 `data/base.py` 的 `MarketProvider` 协议；用 `GET /api/v1/data/sources` 与 `GET /api/v1/data/kline?symbol=...&source=<name>` 验证。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:122-128](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L122-L128)。

---

## DEC-3 入库落原始价，复权由视图派生

- **状态**：已决·勿翻案。
- **背景**：同一条降级链内若混用不同复权口径会污染回测。
- **决策**：入库层落库「原始价」（`adjust=none`），复权由 `adj-factor` 管道反解因子后经 `bar1d_qfq` / `bar1d_hfq` 视图按需派生。
- **理由**：复权口径集中在视图/表函数一层，读取时按需派生，避免在入库环节固化口径。
- **影响**：`adj_factor` 是 qfq/hfq 视图的数据来源，须先于读视图的下游（如 `kline-period` / `features`）。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:60-66](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L60-L66)、[data-pipeline.md:76-78](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L76-L78)。

---

## DEC-4 入库源按标的固定，禁止静默降级

- **状态**：已决·勿翻案。
- **背景**：上游限流下自动降级会导致原始价口径静默不一致。
- **决策**：`kline-1d` 入库管道按标的固定单一源（用 `klineSource(symbol)` 选源：北交所 `.BJ` → 东财，沪深 → 腾讯），禁止在限流下静默切换。
- **理由**：防止同批数据混源、口径漂移，保证回测可信。
- **影响**：该按标选源是对早期「`kline-1d.ts` 硬编码 `source=tencent`」描述的更新。
- **证据来源**：[invariants.md:69-77](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L69-L77)、[kline-1d.ts:45-57](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/pipes/kline-1d.ts#L45-L57)。

---

## DEC-5 回测默认后复权 hfq

- **状态**：已决·勿翻案。
- **背景**：前后复权口径的时间稳定性不同。
- **决策**：回测读取默认 `adjust="hfq"`（后复权）；`qfq`（前复权）仅供展示，禁止用于回测。
- **理由**：后复权锚定上市首日、不改写历史价位，历史序列不随未来事件变化，无前视偏差；前复权锚定最新交易日，历史段会被新分红反复重锚。
- **影响**：回测 / 选股 / 指标统一用 `hfq`，展示场景方可用 `qfq`。
- **证据来源**：[invariants.md:81-87](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L81-L87)、[data_loader.py:27-34](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data_loader.py#L27-L34)。

---

## DEC-6 回测读取接入 PIT

- **状态**：已决·勿翻案（已知数据面缺口见 ISSUES）。
- **背景**：复权因子是时变的，回测需要「站在历史时刻」取快照以消除前视偏差。
- **决策**：指定 `as_of` 时改走 `bar1d_*_at` 表函数，只采用 `known_at <= as_of` 的复权因子快照；`None` 时读视图取最新快照（默认行为，零回归）。
- **理由**：`adj_factor` 是 append-only、带 `known_at`；按历史时刻取快照才能消除前视偏差。
- **影响**：链路为 `BacktestRequest.asOf → load_kline(..., as_of=) → bar1d_*_at`。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:101-108](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L101-L108)、[data-pipeline.md:98-101](file:///Users/wukailin/Documents/study/ai-trader/docs/data-pipeline.md#L98-L101)。

---

## DEC-7 load_kline 输出契约固定

- **状态**：已决·勿翻案。
- **背景**：多个下游共享同一读取入口。
- **决策**：`load_kline` 的输出契约不可更改——`time` 作索引，列为 `open / high / low / close / volume / amount / indicators`。
- **理由**：回测、选股、指标三处都依赖该契约。
- **影响**：任何改动须保持索引与列名 / 列语义不变，否则三处同时失效。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:91-97](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L91-L97)。

---

## DEC-8 东财统一 em_get 串行限流 + 熔断

- **状态**：已决·勿翻案。
- **背景**：东财是唯一有封禁风险的源，且其独有数据无备胎。
- **决策**：所有 `eastmoney.com` 请求强制走 `_em_get()`——全局线程锁串行限流（最小间隔 1.0s + 随机抖动）、锁仅覆盖「等待最小间隔 + 发起单次请求」、重试退避睡眠在锁外、连续失败达阈值（5）即熔断跳闸、冷却期内快速失败上抛交给上层降级链。
- **理由**：慢 / 失败请求长时间持锁会造成全体东财请求排队（head-of-line blocking 雪崩）；熔断放行会让排队请求逐个等待超时、加剧本已拥挤的 WAF。
- **影响**：`_em_get_kline` 遇熔断直接上抛，不再做 `/..` 二次重试。
- **事实校正**：冷却时长文档记载为 30s，代码实际为 `_EM_BREAKER_COOLDOWN = 300.0`（5 分钟），以代码为准，详见 [invariants.md:36](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L36)。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:19-36](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L19-L36)、[data/README.md:282-287](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L282-L287)。

---

## DEC-9 东财行情类端点走 push2delay

- **状态**：已决·勿翻案。
- **背景**：实时 `push2` 并发下易 `RemoteDisconnected`。
- **决策**：行情类端点（`slist/get`、`stock/fflow/kline/get`、`clist/get` 等）统一走 `push2delay`（延迟行情，约 15 分钟）；`push2his` 仅用于历史 K 线 / 日线资金流。
- **理由**：`push2delay` 更稳、并发下不易断连。
- **影响**：行情主机固定为 `push2delay.eastmoney.com`。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:40-46](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L40-L46)、[data/README.md:289](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L289)。

---

## DEC-10 数据源按不封 IP 优先排序

- **状态**：已决·勿翻案。
- **背景**：高频取数需要稳定的、不会触发 IP 封禁的主源。
- **决策**：取数优先级 `mootdx（TCP，不封 IP）> 腾讯（HTTP GBK，不封 IP）> 新浪 / 巨潮 / 同花顺 > 东财（有风控会封 IP，仅用于其独有数据）`。
- **理由**：东财有风控会封 IP；mootdx、腾讯均不封 IP，是限流下的稳定主源。
- **影响**：容量类能力在 `_CAPABILITY_PRIORITY` 里按此顺序声明降级链；东财仅用于其独有数据。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[invariants.md:9-15](file:///Users/wukailin/Documents/study/ai-trader/docs/invariants.md#L9-L15)、[data/README.md:8-17](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L8-L17)。

---

## DEC-11 akquant 策略不迁移 QMT / PTrade

- **状态**：已确立结论（勿重复论证）。
- **背景**：曾评估把 akquant 策略平滑迁移到券商/交易终端平台。
- **决策**：akquant 策略**无法平滑迁移到 QMT / PTrade**。
- **理由**：大 QMT 是 Python 3.6.8 + GBK + `ContextInfo` 的封闭沙箱，MiniQMT 没有回测引擎，两者官方声明不兼容；PTrade 各券商版本 API 也不一致。
- **影响**：不投入「源码级迁移」路线，转向 DEC-12 的契约交换路线。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## DEC-12 研究与执行分离用交换数据契约

- **状态**：已确立结论（勿重复论证）。
- **背景**：研究侧（回测）与执行侧（下单）平台不同、语言与 API 不一致。
- **决策**：研究 / 执行分离的正确做法是**交换数据契约而非交换代码**——研究侧产出 `target_weights`（date / symbol / target_weight），执行侧只保留平台相关的下单薄壳。
- **理由**：避免耦合于某一平台 SDK，研究结果可跨执行平台复用。
- **影响**：执行侧无需理解策略源码，只需消费标准化的目标权重。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## DEC-13 前端「编写 Python 并运行策略」暂不实现

- **状态**：已确立结论（勿重复论证）。
- **背景**：评估在前端直接编辑并运行 Python 策略的能力。
- **决策**：暂不实现，因其目前缺三样：编辑器依赖（web 端无 monaco / codemirror 等）、源码到可运行策略的通路、能承载崩溃与超时的执行边界。
- **理由**：三样基础设施缺一不可，缺任一项都不能安全承载「编写即运行」。
- **影响**：相关能力列为待办，见 [roadmap.md](./roadmap.md)。
- **证据来源**：[AGENTS.md](../AGENTS.md)。

---

## DEC-14 日志高基数字段进 structured metadata

- **状态**：已决·勿翻案。
- **背景**：Loki 的 label 会产生索引，高基数字段进 label 会导致索引爆炸。
- **决策**：`request_id` / `job_run_id` 等高基数字段进 Loki **structured metadata**，不做 label。
- **理由**：防索引爆炸；`level` 在产出端即归一为字符串（采集侧把它当 label，数字会变成无意义取值）。
- **影响**：日志用 pino（生产 JSON、开发 pino-pretty）；全链路追踪用 AsyncLocalStorage，通过请求头透传到 quant。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[architecture.md:99-116](file:///Users/wukailin/Documents/study/ai-trader/docs/architecture.md#L99-L116)。

---

## DEC-15 nginx 长耗时接口超时调至 300s

- **状态**：已决·勿翻案。
- **背景**：选股等 quant 全市场打分需 40–60s，原 `proxy_read_timeout 120s` 会在上游仍在计算时先断开并返回 504。
- **决策**：长耗时接口当前配置 `proxy_read_timeout 300s` / `proxy_send_timeout 300s`。
- **理由**：120s 超时返回 HTML 504，会导致前端解析 JSON 失败。
- **影响**：SSE 场景配套 `proxy_buffering off; proxy_cache off;`；`X-Request-Id` 用 nginx `$request_id` 关联全链路。
- **证据来源**：[architecture.md:66-77](file:///Users/wukailin/Documents/study/ai-trader/docs/architecture.md#L66-L77)、[AGENTS.md](../AGENTS.md)。
