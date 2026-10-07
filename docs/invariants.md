# 不可违背约束（铁律清单）

> 本文件把 [AGENTS.md](../AGENTS.md) 中散落的「铁律 / 不可违背约束」集中编号为 INV-1..N，供动手改任何核心代码前先对照。
> 每条骨架：**规则（一句话祈使句）/ 为什么 / 正确做法 / 违反后果 / 证据来源**。
> 约束来源为 [AGENTS.md](../AGENTS.md)、`apps/quant/data/`、`apps/server/src/workers/` 等既有事实；证据尽量给「文件:行」。

---

## INV-1 数据源按「不封 IP 优先」排序取数

- **规则**：取数一律遵循优先级 `mootdx（TCP）> 腾讯（HTTP GBK）> 新浪 / 巨潮 / 同花顺 > 东财`，能用不封 IP 的源就别用东财。
- **为什么**：东财有风控会封 IP；mootdx 走 TCP、腾讯走 HTTP GBK 均不封 IP，是限流下的稳定主源。
- **正确做法**：行情 / K 线 / 实时价 / 市值走 mootdx / 腾讯 / 百度；容量类能力在 `_CAPABILITY_PRIORITY` 里按此顺序声明降级链。
- **违反后果**：高频打东财触发 IP 封禁，拖垮所有依赖东财的批量任务。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[registry.py:6-9](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/registry.py#L6-L9)、[registry.py:65-97](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/registry.py#L65-L97)、[data/README.md:17](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/README.md#L17)

---

## INV-2 东财仅用于其独有数据，且必须走统一 `em_get()` 串行限流

- **规则**：东财只用于「别处拿不到」的数据（板块资金流 / 龙虎榜 / 解禁 / 融资融券 / 研报等），且所有 `eastmoney.com` 接口必须经 `_em_get()` 请求，禁止直接 `requests.get`。
- **为什么**：东财独有数据无备胎；直连会绕过串行限流，触发风控封 IP。
- **正确做法**：`_em_get()` 是东财唯一请求入口（统一 UA + 串行限流 + 内建重试），新端点一律复用它。
- **违反后果**：绕过限流的并发请求触发封禁，连累同进程所有东财能力。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[provider.py:180-186](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L180-L186)

---

## INV-3 `em_get` 防雪崩结构不可改：锁只覆盖单次请求、重试睡眠在锁外、连续失败熔断

- **规则**：`_em_get` 的串行锁只覆盖「等待最小间隔 + 发起单次请求」，重试退避睡眠必须放在锁外；连续失败达阈值（5）即熔断跳闸，冷却期内东财请求快速失败上抛交给上层降级链；`_em_get_kline` 遇熔断直接上抛，不再做 `/..` 二次重试。
- **为什么**：慢 / 失败请求若长时间持锁会造成全体东财请求排队（head-of-line blocking 雪崩）；熔断放行会让排队请求逐个等待超时、加剧本已拥挤的 WAF。
- **正确做法**：维持现有锁边界与熔断阈值；遇熔断由上层降级链兜底，不自行重试。
- **违反后果**：单个慢请求拖垮全局东财吞吐，或熔断期反复探测维持封禁状态。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[provider.py:89-97](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L89-L97)、[provider.py:187-214](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L187-L214)、[provider.py:245](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L245)
- **⚠️ 事实校正**：[AGENTS.md](../AGENTS.md) 写「冷却 30s」，但代码实际为 `_EM_BREAKER_COOLDOWN = 300.0`（5 分钟，注释说明「与管道重试窗口对齐」）。以代码为准，见 [provider.py:93-94](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L93-L94)。

---

## INV-4 东财行情类端点统一走 `push2delay`，不用实时 `push2`

- **规则**：`slist/get`、`stock/fflow/kline/get`、`clist/get` 等行情类端点统一走 `push2delay`（延迟行情），不用实时 `push2`。
- **为什么**：`push2delay` 约 15 分钟延迟，较实时 `push2` 更稳、并发下不易 `RemoteDisconnected`。
- **正确做法**：行情主机固定为 `push2delay.eastmoney.com`；`push2his` 仅用于历史 K 线 / 日线资金流。
- **违反后果**：并发下出现 `RemoteDisconnected`，请求失败累加熔断计数。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[provider.py:217-222](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L217-L222)、[provider.py:264](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L264)

---

## INV-5 东财个股新闻必须用 `cmsArticleWebOld` 参数并正确解 JSONP

- **规则**：东财个股新闻（`search-api-web.eastmoney.com/search/jsonp`）必须用 `type:["cmsArticleWebOld"]` + `param.cmsArticleWebOld` 子对象；响应是 JSONP，取首个 `(` 与末个 `)` 之间再 `JSON.parse`，正文列表在 `result.cmsArticleWebOld`。
- **为什么**：旧值 `type:["819"]` 已废弃，会返回 `包含未知的type：819`；JSONP 用贪婪正则捕获括号会吞掉结尾的 `)`/`;`，导致 `JSON.parse` 报错。
- **正确做法**：按 [news.ts:368-410](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/pipes/news.ts#L368-L410) 的写法：索引定界取括号，禁用贪婪正则。
- **违反后果**：个股新闻静默返回空或解析失败，数据断更。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[news.ts:352-362](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/pipes/news.ts#L352-L362)、[news.ts:399-410](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/pipes/news.ts#L399-L410)

---

## INV-6 同一条降级链内不得混用不同复权口径

- **规则**：同一条降级链内不得混用不同复权口径；入库管道固定单一源正是为防止降级污染口径。
- **为什么**：降级切换会让同一批数据混入不同口径（复权 / 不复权、前后复权），污染回测与前视偏差。
- **正确做法**：入库层落库「原始价」（`adjust=none`），复权由 `adj-factor` 管道反解因子后经 `bar1d_qfq` / `bar1d_hfq` 视图按需派生；需固定源时在管道层硬定 `source`，不启用降级。
- **违反后果**：原始价口径不一致，回测结果不可信。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[kline-1d.ts:51-61](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/pipes/kline-1d.ts#L51-L61)

---

## INV-7 回测入库源按标的固定，禁止静默降级

- **规则**：`kline-1d` 入库管道按标的固定单一源：沪深固定腾讯、北交所固定东财，禁止在上游限流下静默切换。
- **为什么**：上游限流下自动降级会导致原始价口径静默不一致（见 INV-6）。
- **正确做法**：用 `klineSource(symbol)` 按标的选源，落库原始价，复权交由视图派生。
- **违反后果**：同批数据混源、口径漂移，回测不可信。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[kline-1d.ts:45-57](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/pipes/kline-1d.ts#L45-L57)
- **⚠️ 事实校正**：[AGENTS.md](../AGENTS.md)、[AGENTS.md](../AGENTS.md) 描述为「`kline-1d.ts` 硬编码 `source=tencent`」，但当前代码已改为按标的选源（`.BJ` → 东财，否则腾讯），见 [kline-1d.ts:55-57](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/pipes/kline-1d.ts#L55-L57)。

---

## INV-8 回测复权默认后复权 `hfq`，前复权 `qfq` 禁止用于回测

- **规则**：回测读取默认 `adjust="hfq"`（后复权）；`qfq`（前复权）仅供展示，禁止用于回测。
- **为什么**：后复权锚定上市首日、不改写历史价位，历史序列不随未来事件变化，无前视偏差；前复权锚定最新交易日，历史段会被新分红反复重锚（同一历史日不同时刻读出不同价位）。
- **正确做法**：回测 / 选股 / 指标统一用 `hfq` 口径；展示场景方可用 `qfq`。
- **违反后果**：同一历史日不同时刻读出不同价位，回测与因子产生前视偏差。
- **证据来源**：[data_loader.py:27-34](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data_loader.py#L27-L34)

---

## INV-9 `load_kline` 输出契约不可更改

- **规则**：`load_kline` 的输出契约不可更改——`time` 作索引，列为 `open / high / low / close / volume / amount / indicators`。
- **为什么**：回测、选股、指标三处都依赖该契约。
- **正确做法**：任何改动保持索引与列名 / 列语义不变。
- **违反后果**：回测、选股、指标三处同时失效。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[data_loader.py:20-29](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data_loader.py#L20-L29)、[data_loader.py:66-80](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data_loader.py#L66-L80)

---

## INV-10 PIT 复权：`as_of` 只取 `known_at <= as_of` 的快照

- **规则**：指定 `as_of` 时必须改走 `bar1d_*_at` 表函数，只采用 `known_at <= as_of` 的复权因子快照；`None` 时读视图取最新快照。
- **为什么**：`adj_factor` 是 append-only、带 `known_at`；按历史时刻取快照才能消除前视偏差。
- **正确做法**：`BacktestRequest.asOf` → `load_kline(..., as_of=)` → `bar1d_*_at` 表函数；保持 `as_of=None` 的既有行为零回归。
- **违反后果**：回测用到「当时尚未发生」的复权因子，产生前视偏差。
- **已知缺口**：`adj_factor` 目前仅 1 个快照（2026-10-01），`as_of` 早于该时刻无版本可选、等价于不复权，需每日同步累积出多版本后才有区分度。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[data_loader.py:36-40](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data_loader.py#L36-L40)、[main.py:120](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/main.py#L120)

---

## INV-11 任务记录表名是单数 `job_run`

- **规则**：任务记录表名为 `job_run`（单数）。
- **为什么**：ORM 表名即真实表名；手工查询写成复数会报错。
- **正确做法**：查库 / 写 SQL 统一用 `job_run`。
- **违反后果**：手工查询 `job_runs` 会报 `relation "job_runs" does not exist`。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[ops.ts:44](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/db/schema/ops.ts#L44)

---

## INV-12 切取数层只改注册表两处

- **规则**：切「取数层」只需改 `registry.py` 的两处——`_PROVIDER_CLASSES`（注册 provider 类）与 `_CAPABILITY_PRIORITY`（决定降级链顺序），不得改动 router 或各 provider 实现。
- **为什么**：注册表是取数层唯一的路由 / 降级配置入口。
- **正确做法**：新 provider 放 `data/providers/<name>/provider.py`，实现 `data/base.py` 的 `MarketProvider` 协议；用 `GET /api/v1/data/sources` 与 `GET /api/v1/data/kline?symbol=...&source=<name>` 验证。
- **违反后果**：绕过注册表硬编码会破坏降级链与运维观测。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[registry.py:11-12](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/registry.py#L11-L12)、[registry.py:53-60](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/registry.py#L53-L60)、[registry.py:65](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/registry.py#L65)

---

## INV-13 切回测数据源必须改入库管道并重建 / 双跑比对

- **规则**：切「回测数据源」必须改入库管道、重建历史数据，并做新旧源双跑比对后才能上生产。
- **为什么**：回测读取层只读库内复权视图 / 表函数，历史数据口径变更无法通过改读取层即时生效。
- **正确做法**：改 `pipes/kline-1d.ts` 的选源逻辑 → 重建历史数据 → 新旧源双跑比对 → 再上生产。
- **违反后果**：库内历史数据与新源口径不一致，回测结果失真。
- **证据来源**：[AGENTS.md](../AGENTS.md)

---

## INV-14 换源 / 回测前必查的 A 股可信度缺口

- **规则**：回测或换源前必须核查复权 PIT 化、停牌标记、涨跌停成交判定三项缺口；并记住 baostock 不支持北交所。
- **为什么**：这三项是 A 股回测可信度的已知缺口；baostock 对北交所无数据。
- **正确做法**：涉及北交所标的时勿选 baostock；涨跌停判定基于**原始价**前收（`load_raw_close`），不能用后复权价近似。
- **违反后果**：回测忽略涨跌停 / 停牌约束、口径近似，结果不可信；北交所取数静默失败。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[data_loader.py:89-99](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data_loader.py#L89-L99)、[main.py:157-162](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/main.py#L157-L162)
