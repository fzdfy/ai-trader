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
- 自选股内容任务只读取 `watchlist`，不得退化为全市场抓取；新闻 20 条、公告 30 天、研报 12 个月为固定首次窗口。
- `company_announcement` 以 `(source, source_url)` 唯一；迁移清理重复行时保留最大 `id`，其他历史行按 `id` 确定性删除。
- 新闻按 `(source, url)` 唯一，空 Provider URL 必须生成稳定 `fallback:` 键；新闻关联以 `(article_id, symbol)` 唯一，查询标的必须显式关联。

## 角色与数据管理审计

- `user.role` 仅允许 `user | super_admin`，默认 `user`；客户端不能提交或修改角色。
- `SUPER_ADMIN_EMAILS` 只在服务端读取，仅用于把已通过邮箱验证的白名单账号提升为 `super_admin`；邮箱移出白名单不会静默降级已有数据库角色。
- 数据管理 API 必须同时校验 Better Auth Session 和数据库角色；菜单隐藏不能替代服务端授权。
- `admin_operation_audit` 只追加操作记录并收敛状态。手动同步与失败重试必须记录操作者、动作、目标模块、原因、`request_id`、`job_run_id`、参数、结果、错误和时间；服务器启动、worker 启动和审计查询需把遗留 accepted/running 记录按关联任务终态收敛，无法关联则标记 `interrupted`。
- 手动同步、模块重试和任务预留必须使用 PostgreSQL advisory lock 串行化检查与插入，不能只依赖进程内状态。
- 一期不提供凭据编辑、历史回补、派生重建、暂停调度、删除任务、原始数据行或任意 SQL 接口。

## 数据治理证据

- 静态治理元数据保存在代码注册表；数据库只保存质量执行结果、数据事故、治理 Work Task 和相关事件。
- `data_quality_result` 保存资产、规则版本、状态、严重度、任务标识、请求标识、指标和证据 JSON。
- `data_incident` 保存当前事故状态，`data_incident_event` 追加确认、处理和解决事件。
- `work_task` 保存治理审阅任务当前状态，`work_task_event` 追加状态事件；首期不实现完整任务中心。
- 质量结果、事故和任务事件不提供管理 API 删除入口；保留策略由后续生命周期治理统一执行。
- 治理证据与原始行情分开备份恢复：恢复质量结果、事故和任务时不得重建、改写或回滚 `bar1d_raw`、`adj_factor` 及 `load_kline` 输出契约。
- 回退门禁只切换 `DATA_GOVERNANCE_GATE_MODE=warn|off`，不得删除已产生的质量结果、事故或 Work Task；恢复演练后需校验事件链完整且新增证据仍可追加。

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
- 新闻、公告、研报内容规则统一为 Tier 1 `warning`，不阻断研究门禁；至少覆盖新闻关联覆盖和研报 PDF 提取状态。

## 研报与个股分析

- 研报元数据、PDF 文档、分块、预测、财务、估值和公告使用独立表，不复用新闻向量表。
- PDF 二进制保存到共享 `reports-data:/data/reports`；PostgreSQL 保存 `storage_key`、SHA-256、页数和全文。
- 研报分块使用 `vector(512)`，由本地 `BAAI/bge-small-zh-v1.5` 生成；HNSW 用于语义检索，`pg_trgm` 作为关键词降级。
- 研报检索只返回发布日期不晚于分析快照的原文，并保留标题、机构、日期、页码和片段。
- 个股分析数值由确定性代码计算；LLM 只归纳结构化指标和研报证据，不生成目标价。
