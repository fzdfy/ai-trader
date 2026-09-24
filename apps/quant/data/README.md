# quant 数据服务 — 数据源方案与端点手册

统一数据获取服务（FastAPI）。挂载于 `/api/v1/data`，返回字段统一 snake_case。

架构：`router`（端点）→ `registry`（能力注册 + 降级链）→ `providers`（各数据源实现）。
调用方只面向 `MarketProvider` 协议编程，切换 / 增删数据源无需改动上层。

## 数据源总览（6 个 Provider）

| Provider | 能力（capabilities） | 接口域名 | 风控特征 |
|---|---|---|---|
| `tencent` 腾讯 | quote、kline、transaction | `qt.gtimg.cn`、`proxy.finance.qq.com`、`stock.gtimg.cn` | 不封 IP，连续 5000+ 次才限流返回空 |
| `mootdx` 通达信 | kline、quote、transaction | 本地 TDX 行情库（非 HTTP） | 本地接口，无网络风控 |
| `baidu` 百度 | kline | `finance.pae.baidu.com` | 需 Origin/Referer，低频不封 |
| `sina` 新浪 | adjust_factor | `finance.sina.com.cn` | 带 UA/Referer，低频不封 |
| `ths` 同花顺 | hot_reason、northbound | `zx.10jqka.com.cn`、`data.hexin.cn` | 需 UA/Referer，低频不封 |
| `eastmoney` 东财 | 22 项（信号/资金/筹码层） | `push2` / `push2delay` / `push2his` / `datacenter-web` | 有风控：>5次/秒、并发≥10、1分钟≥200 会临时封 IP，统一走 `_em_get` 串行限流 |

## 通用参数

除 `/sources` 外，每个端点都带可选 `source` 参数：指定则强制用该数据源（不支持该能力返回 400），不指定走降级链。

---

## 端点手册

### `/sources`

列出各数据源及其 capabilities。无参数。

---

## 行情层（Layer 2 — 多源降级链）

### `/kline` — K 线（多周期）

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `symbol` | str | 必填 | — | 标的代码，如 `600519` / `000001.SZ` |
| `tf` | str | `1d` | 1m/5m/15m/30m/60m/1d/1w/1mo | 周期 |
| `adjust` | str | `qfq` | qfq/hfq/none | 复权（仅 tf=1d 有效） |
| `start` | str | null | YYYY-MM-DD | 起始日期 |
| `end` | str | null | YYYY-MM-DD | 结束日期 |
| `limit` | int | `500` | 1~5000 | 返回根数上限 |
| `source` | str | null | — | 强制指定源 |

来源：腾讯（主）→ mootdx（备）→ 百度（备）。风控：均不封 IP。

### `/quotes` — 批量实时行情

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `codes` | str | 必填 | 逗号分隔代码列表，如 `600519,000001` |
| `source` | str | null | — |

来源：腾讯（主，含 PE/PB/市值/换手率）→ mootdx（备，五档盘口）。

### `/transaction` — 逐笔成交

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `symbol` | str | 必填 | 标的代码 |
| `date` | str | null | 交易日 YYYYMMDD，缺省取最近（腾讯主源仅提供最近交易日） |
| `source` | str | null | — |

来源：腾讯 `tencent_ticks`（主，约 3 秒一笔的分笔，最近一个交易日，沪深个股与 ETF）→ mootdx（备，支持指定历史日）。

### `/adjust-factor` — 复权因子序列

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `symbol` | str | 必填 | 标的代码 |
| `kind` | str | `qfq` | qfq 前复权 / hfq 后复权 |
| `source` | str | null | — |

来源：新浪（仅此源）。

---

## 信号层（Layer 3 — 独有单源）

### `/hot-reason` — 强势股 + 题材归因

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `date` | str | null | YYYY-MM-DD，缺省今天 |
| `source` | str | null | — |

来源：同花顺 `zx.10jqka.com.cn`（仅此源）。

### `/northbound` — 沪深股通实时分钟流向

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `source` | str | null | — |

来源：同花顺 `data.hexin.cn`（仅此源）。

### `/concept-blocks` — 个股所属板块/概念归属

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `symbol` | str | 必填 | 如 `600519` |
| `source` | str | null | — |

来源：东财 `push2` slist（独有）。风控：`_em_get` 限流。

### `/fund-flow-minute` — 个股资金流（分钟级）

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `symbol` | str | 必填 | 标的代码 |
| `source` | str | null | — |

来源：东财 `push2` fflow/kline（独有）。风控：`_em_get` 限流。

### `/dragon-tiger` — 个股龙虎榜（上榜记录 + 席位 + 机构动向）

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `symbol` | str | 必填 | — | 标的代码 |
| `trade_date` | str | null | YYYY-MM-DD | 缺省今天 |
| `look_back` | int | `30` | 1~365 | 回看天数 |
| `source` | str | null | — | — |

来源：东财 datacenter（独有）。风控：`_em_get` 限流。

### `/lockup-expiry` — 限售解禁日历（历史 + 未来 N 天）

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `symbol` | str | 必填 | — | 标的代码 |
| `trade_date` | str | null | YYYY-MM-DD | 基准日 |
| `forward_days` | int | `90` | 1~365 | 向前看天数 |
| `source` | str | null | — | — |

来源：东财 datacenter（独有）。风控：`_em_get` 限流。

### `/industry-comparison` — 全行业涨跌幅排名

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `top_n` | int | `20` | 1~100 | 返回前 N 名 |
| `source` | str | null | — | — |

来源：东财 `push2` clist（独有）。风控：`_em_get` 限流。

### `/board-fund-flow` — 板块资金流向（行业/概念/地域 × 今日/5日/10日）

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `board_type` | str | `industry` | industry/concept/region | 板块类型 |
| `period` | str | `today` | today/5d/10d | 统计周期 |
| `top_n` | int | `20` | 1~100 | 返回前 N 名 |
| `source` | str | null | — | — |

来源：东财 `push2delay` clist（独有）。风控：`_em_get` 限流。

### `/fund-flow-rank` — 全市场个股资金流排行（主力净流入降序）

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `top_n` | int | `100` | 1~1000 | 返回前 N 名 |
| `source` | str | null | — | — |

来源：东财 `push2delay` clist（独有）。风控：`_em_get` 限流。

### `/board-list` — 板块列表（热力图一级节点）

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `board_type` | str | `industry` | industry/concept | 板块类型 |
| `source` | str | null | — | — |

来源：东财 `push2delay` clist（独有）。风控：`_em_get` 限流。

### `/board-constituents` — 板块成分股列表（热力图二级节点）

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `board_code` | str | 必填 | BK 板块代码，如 `BK0475` |
| `source` | str | null | — |

来源：东财 `push2delay` clist（独有）。风控：`_em_get` 限流。

### `/board-kline` — 板块指数日 K 线

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `board_code` | str | 必填 | — | BK 板块代码 |
| `limit` | int | `500` | 1~5000 | 根数上限 |
| `start` | str | null | YYYY-MM-DD | 起始日期 |
| `end` | str | null | YYYY-MM-DD | 结束日期 |
| `source` | str | null | — | — |

来源：东财 `push2his`（BK 指数独有）。风控：`_em_get` 限流。

### `/daily-dragon-tiger` — 全市场龙虎榜汇总

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `trade_date` | str | null | YYYY-MM-DD，缺省今天 |
| `min_net_buy` | float | null | 净买入下限（万元） |
| `source` | str | null | — |

来源：东财 datacenter（独有）。风控：`_em_get` 限流。

---

## 资金面 / 筹码层（Layer 4 — 独有单源）

### `/margin-trading` — 融资融券明细（日级）

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `symbol` | str | 必填 | — | 标的代码 |
| `page_size` | int | `30` | 1~100 | 返回条数 |
| `source` | str | null | — | — |

来源：东财 datacenter（独有）。风控：`_em_get` 限流。

### `/block-trade` — 大宗交易记录

| 参数 | 类型 | 默认 | 约束 |
|---|---|---|---|
| `symbol` | str | 必填 | — |
| `page_size` | int | `20` | 1~100 |
| `source` | str | null | — |

来源：东财 datacenter（独有）。风控：`_em_get` 限流。

### `/holder-num` — 股东户数变化（季度级）

| 参数 | 类型 | 默认 | 约束 |
|---|---|---|---|
| `symbol` | str | 必填 | — |
| `page_size` | int | `10` | 1~100 |
| `source` | str | null | — |

来源：东财 datacenter（独有）。风控：`_em_get` 限流。

### `/dividend-history` — 分红送转历史

| 参数 | 类型 | 默认 | 约束 |
|---|---|---|---|
| `symbol` | str | 必填 | — |
| `page_size` | int | `20` | 1~100 |
| `source` | str | null | — |

来源：东财 datacenter（独有）。风控：`_em_get` 限流。

### `/fund-flow-120d` — 个股资金流（日级，近 120 交易日）

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `symbol` | str | 必填 | 标的代码 |
| `source` | str | null | — |

来源：东财 `push2his`（独有）。风控：`_em_get` 限流。

### `/chip-distribution` — 筹码分布（本地推演）

| 参数 | 类型 | 默认 | 约束 | 说明 |
|---|---|---|---|---|
| `symbol` | str | 必填 | — | 标的代码 |
| `days` | int | `120` | 30~1000 | 回看交易日数 |
| `grid_size` | int | `300` | 50~1000 | 成本区间栅格数 |
| `decay` | float | `1.0` | 0.1~3.0 | 换手衰减系数 |
| `source` | str | null | — | — |

来源：mootdx 日线 OHLC + 腾讯流通市值（本地推演，跨源编排）。风控：两源均不封 IP。

---

## 降级机制

- **多源降级链**：仅 4 个行情层能力有真降级链（`kline`/`quote`/`transaction`/`adjust_factor`），由 `registry.call_with_fallback` 按 `_CAPABILITY_PRIORITY` 顺序依次调用，任一源失败捕获异常落到下一源，全部失败才抛最后一个异常。
- **独有单源**：信号/资金/筹码层共 20 项为东财或同花顺「独有、别处拿不到」，降级链只有 1 个源，无备胎。真正的兜底在 server 端：
  - sync 脚本对每类数据 `try/catch` 失败即 `skip`，不中断整轮；
  - 热力图等实时页面在 DB 兜底模式跳过成分股、15s 总时限。

## 风控方案

1. **东财（唯一有封禁风险的源）**：所有 `eastmoney.com` 请求强制走 `_em_get()` ——
   - **串行限流**：全局线程锁保证同一时刻只发一个东财请求，两次请求最小间隔 `1.0s` + 随机抖动 `0.1~0.5s`，统一 UA；
   - **锁粒度**：锁仅覆盖「等待最小间隔 + 发起单次请求」，重试退避睡眠在**锁外**进行，避免慢/失败请求长时间持锁导致全体请求排队（head-of-line blocking 雪崩）；
   - **熔断**：连续失败达 `5` 次即跳闸，冷却 `30s` 内所有东财请求快速失败上抛（由上层降级链处理），冷却后自动恢复；`_em_get_kline` 遇熔断直接上抛，不再走 `/..` 二次尝试。
2. **腾讯/mootdx/百度/新浪/同花顺**：不封 IP，无需限流；仅带 UA 和必要的 Referer/Origin。
3. **域名选择**：东财行情类端点（`slist/get`、`stock/fflow/kline/get`、`clist/get` 等）统一走 `push2delay`（延迟行情，约 15 分钟，较实时 `push2` 更稳、不易 `RemoteDisconnected`）；`push2his` 用于历史 K 线/日线资金流。

## 待办 / 风险点

- 信号/资金/筹码层多数能力为东财单源（见「降级机制」），东财整体被封时无备胎；熔断会让这些能力在冷却期内快速失败并 `skip`，属预期内的保护行为。
