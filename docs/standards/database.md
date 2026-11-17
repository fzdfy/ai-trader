# 数据工程标准

## 三条链路

- A 取数层：实时抓取，不落库。
- B 入库层：Worker 拉取并写 PostgreSQL。
- C 回测读取层：只读数据库视图或 PIT 表函数。

## 数据源

- 优先级：mootdx > 腾讯 > 新浪/巨潮/同花顺 > 东财。
- 东财只用于独有数据，所有请求经过统一 `em_get()`。
- 连续失败 5 次熔断，冷却以代码为准，当前 300 秒。
- 行情类东财端点使用 `push2delay`。
- 开发期可参考 `a-stock-data` skill；生产运行不依赖 skill。

## 同步

- 交易日收盘后调度，失败在 deadline 前重试。
- 显式依赖：`boards → board-kline/constituents`，`kline-1d → adj-factor → kline-period/features`。
- 幂等键至少包含 `jobType + tradeDate + status`。
- 区分 `executed`、`skipped`、`failed`。
- 历史回补与当日同步分离并错峰。
- `job_run` 是单数表名。

## 价格与 PIT

- 入库只写原始价 `adjust=none`。
- 复权由因子和视图派生。
- 回测默认 `hfq`，`qfq` 仅展示。
- `as_of` 只读取 `known_at <= as_of`。
- `load_kline` 输出契约固定为 `time` 索引和标准 OHLCV/amount/indicators。

## 质量

- 数据非空、日期新鲜、覆盖率合理。
- 停牌和长期无行情不误判为失败。
- 部分写入后任务失败，依赖幂等重跑补齐。
- `request_id`、`job_run_id` 和交易日全链路可追踪。
