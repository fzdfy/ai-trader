# 排障手册（runbooks）

> 面向线上故障的定位与处置。每条采用统一骨架：**现象 / 根因 / 快速判定 / 处置 / 预防 / 证据来源**。
> 内容全部取自仓库既有事实（[AGENTS.md](../AGENTS.md) 与源码），不含推测；证据尽量给「文件:行」。
> 返回导航：[docs/README.md](./README.md)。相关约束见 [invariants.md](./invariants.md)。

## 0. 通用信息

- 任务记录表名是 `job_run`（**单数**）；手工查询写成 `job_runs` 会报 `relation "job_runs" does not exist`。
- 同步任务状态相关接口在返回前会**顺带触发僵尸清理** `cleanupStaleRuns`：`GET /api/v1/sync/status`、`GET /api/v1/sync/records`、`GET /api/v1/sync/modules`、`POST /api/v1/sync/run`。
- 数据源运行时健康 / 熔断快照：`GET /api/v1/data/sources/health`（纯读快照，不触发外部取数）。
- 全链路定位靠同一 `request_id` / `job_run_id`：HTTP 入口由 `middleware/request-id.ts` 建上下文，定时任务由 `wrapJob` 建，`lib/quant.ts` 透传到 quant；高基数字段进 Loki **structured metadata**（不做 label）。

---

## RB-1 僵尸任务：job_run 停在 running

- **现象**：同步中心 / 接口显示某任务一直「运行中」；`job_run` 行 `status=running` 且 `finished_at` 为空。
- **根因**：进程崩溃、worker/server 重启、或请求断开悬挂导致任务未写终态；此外**判活以 `startedAt` 为基准**，真在跑的长任务会被误判为僵尸。
- **快速判定**：先分清三种「非正常结束」标记的来源（排查前必查）：

  | 标记 | 写入者 | 触发时机 | 作用范围 |
  |---|---|---|---|
  | `interrupted (stale)` | `cleanupStaleRuns` | worker 每 10 分钟 + 各查询 / 触发接口前 | 全部 jobType：`running` 且 `finished_at` 为空且 `startedAt` 早于 `now - 3h` |
  | `interrupted (worker restart)` | `cleanupInterruptedJobs` | worker 启动 | `running` 且 `finished_at` 为空且 `jobType ≠ sync-manual` |
  | `interrupted (server restart)` | `cleanupInterruptedSyncs` | server 启动 | **仅** `jobType = sync-manual` |

- **处置**：
  1. 若某任务刚被 `cleanupStaleRuns` 改判 `failed` 但进程仍在跑（DB 行与真实运行状态不一致），**不要据此重启**——以进程 / 日志为准，等其自然结束。
  2. 无需人工干预即可自愈：worker 周期清理、worker/server 启动清理、以及上述查询 / 触发接口都会自动清。
  3. 确需立即人工清理时，可参考（**运维示例，非仓库现有脚本**；用前务必确认阈值，避免误杀真跑任务）：

     ```sql
     UPDATE job_run
        SET status = 'failed', error = 'interrupted (manual)', finished_at = now()
      WHERE status = 'running' AND finished_at IS NULL
        AND started_at < now() - interval '3 hours';
     ```

- **预防 / 改进方向**：引入心跳机制（`updateProgress` 顺带续期），改按「最近心跳」判活，避免真跑长任务被按 `startedAt` 误杀。
- **已知误区（勿混用）**：
  - 僵尸阈值 `STALE_RUN_MS = 3h`，且以 `startedAt` 判活。
  - worker 启动清理会把 **server 手动同步正在跑的子任务**一并标 failed（跨进程误杀）。
  - 2026-09-21 案例：东财雪崩拖垮 quant 后单标的请求大面积超时，`kline-1d` 全市场整批耗时 >3h（正常约 46 分钟 / 约 5552 只），被 `cleanupStaleRuns` 按阈值误杀——`3056` / `3310` 的 `finished_at - started_at` 精确等于 3h，进度仅 `782/5552`、`833/5553`。东财加固后**待观察**下一交易日 15:10 那轮是否恢复。`kline-1d` 由 cron `10 15 * * 1-5` 触发，deadline 18:00，内部循环重试。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[runner.ts:95-102](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/runner.ts#L95-L102)、[runner.ts:275-282](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/runner.ts#L275-L282)、[index.ts:17-26](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/index.ts#L17-L26)、[index.ts:118-125](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/index.ts#L118-L125)、[main.ts:22-37](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/main.ts#L22-L37)、[sync.ts:103](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/api/sync.ts#L103)、[cron-config.ts:31](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/cron-config.ts#L31)

---

## RB-2 东财熔断 / 限流（eastmoney circuit breaker open）

- **现象**：东财独有数据批量失败（板块资金流 / 龙虎榜 / 解禁 / 融资融券 / 筹码 / 研报等）；日志出现 `eastmoney circuit breaker open (cooling down)`。
- **根因**：东财有风控会封 IP。统一入口 `_em_get` 串行限流，连续失败达阈值（**5**）即熔断跳闸，冷却期内所有东财请求**快速失败上抛**，交由上层降级链兜底（东财独有能力多为**无备胎单源**，真正兜底在 server 端 `try/catch` 失败即 `skip`，不中断整轮）。
- **快速判定**：`GET /api/v1/data/sources/health` 读 `providers[].breaker`（`tripped` / `fail_streak` / `threshold` / `cooldown_remaining_sec` / `min_interval_sec` / `bypass_url_count`）；`capabilities[]` 中 `degraded=true` 表示该能力已从主源降级。
- **处置**：
  1. `tripped=true` 时**等冷却自动恢复**，期间不要并发重试轰炸（反复探测会维持封禁状态）。
  2. 若**反复跳闸**：说明可能是 IP 级封禁（通常持续数十分钟到数小时），应降低东财调用频率 / 错峰（历史回补任务已按 19:00–19:30 错峰，正是为此）。
  3. 排查是否有**绕过 `em_get` 的直连**（违反 [INV-2](./invariants.md)），其并发请求会触发封禁并累加熔断失败计数。
  4. WAF 对 `clist/get`、`kline/get` 两条路径**按路径**断连（`RemoteDisconnected`），改用末尾追加 `/..` 绕过（`_EM_WAF_BYPASS_SUFFIX`）；已被拦 URL 记入 `_em_bypass_urls`，命中后不再重复直连探测。熔断跳闸时 `_em_get_with_bypass` / `_em_get_kline` **直接上抛**，不再发起 `/..` 尝试。
- **预防**：保持 `_EM_MIN_INTERVAL = 1.5s`（含抖动实际约 1.3s 会长期贴着东财「5 分钟 ≥300」阈值运行，故放宽留余量）、锁只覆盖单次请求、重试睡眠在锁外、熔断阈值与冷却不变；行情类端点走 `push2delay`；K 线入库沪深固定腾讯、北交所东财。
- **⚠️ 事实校正**：[AGENTS.md](../AGENTS.md) 写「冷却 30s」，代码实际为 `_EM_BREAKER_COOLDOWN = 300.0`（5 分钟，注释说明「与管道重试窗口对齐」）。以代码为准。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[provider.py:80-144](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L80-L144)、[provider.py:173-214](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L173-L214)、[provider.py:217-260](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/providers/eastmoney/provider.py#L217-L260)、[router.py:100-136](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/data/router.py#L100-L136)

---

## RB-3 回测 / 选股超时（nginx 返回 504 HTML，前端解析失败）

- **现象**：前端发起回测 / 选股长时间无响应或报错；nginx 在 quant 仍在计算时先断开，返回 504 HTML，导致前端按 JSON 解析失败。
- **根因**：
  - quant `POST /api/v1/backtests/run` 是**同步函数且没有 `try/except`**（同文件其他端点都有，如 `/features/compute`、`/screens/run`），长任务会挂住 HTTP 连接。
  - server `apps/server/src/api/backtests.ts` 的 `fetch` **没有 `AbortSignal`**，无法在中途取消。
  - nginx `proxy_read_timeout` 历史上为 120s，会在上游仍在计算时先断开并返回 504 HTML；当前配置已调为 **300s**（选股全市场打分 40–60s，叠加固定阈值股票池 SQL 后可能逼近 2 分钟）。
- **快速判定**：看响应体是否为 HTML（504 页面）而非 JSON；对照 quant 日志是否有「回测开始」但无结束记录。
- **处置**：
  1. 确认 `docker/nginx.conf` 的 `proxy_read_timeout` / `proxy_send_timeout` 为 **300s**（若被回退为 120s 需改回）。
  2. 若确为超长计算，评估是否继续提高超时；同时注意 `backtests/run` 缺 `try/except`、server fetch 缺 `AbortSignal`，异常会直接透传为 500 / 超时，前端错误处理不完整。
- **预防**：给 `POST /api/v1/backtests/run` 补 `try/except`；给 server `backtests.ts` 的 fetch 补 `AbortSignal`（均属已知缺陷）。
- **证据来源**：[AGENTS.md](../AGENTS.md)、[main.py:118-182](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/main.py#L118-L182)、[main.py:185-214](file:///Users/wukailin/Documents/study/ai-trader/apps/quant/main.py#L185-L214)、[backtests.ts:22-61](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/api/backtests.ts#L22-L61)、[nginx.conf:51-67](file:///Users/wukailin/Documents/study/ai-trader/docker/nginx.conf#L51-L67)

---

## RB-4 手动同步无法触发（防重入 / 僵尸 sync-manual 阻塞）

- **现象**：点击手动同步被拒绝；或触发后「全部跳过（无实际操作）」，看似没执行。
- **根因**：
  - `POST /api/v1/sync/run` 有**防重入**：存在未结束（`running` 且 `finished_at` 为空）的 `sync-manual` 任务时拒绝新请求（跨请求 / 进程一致）。
  - 收盘任务在 `waitManualSync` 时遇手动同步进行中会**等待**（受 deadline 约束），而非跳过。
  - 当日已同步完整（`job_run` 有当日 `success`）且非 `force` 时，手动同步会**跳过**该管道并计入 `skipped`，避免重复全市场拉取。
- **快速判定**：查 `job_run` 中是否存在 `jobType='sync-manual'` 且 `status='running'`、`finished_at IS NULL` 的行；区分 `executed`（真实执行）与 `skipped`（今日已同步跳过）。
- **处置**：
  1. 若为**僵尸 sync-manual 阻塞**：其超过 `STALE_RUN_MS(3h)` 后不再被视为「进行中」（`isManualSyncRunning` 只认阈值内的 running），worker 周期清理 / 重启清理会自动改判；也可按 RB-1 处置。
  2. 若为「今日已同步跳过」：属预期幂等行为；确需重跑用 `force`。
- **预防 / 已知误区**：worker 启动清理会把 server 手动同步正在跑的子任务一并标 failed（跨进程误杀，DB 记录与真实运行状态不一致，见 RB-1）。
- **证据来源**：[sync.ts:101-108](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/api/sync.ts#L101-L108)、[sync.ts:254-262](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/api/sync.ts#L254-L262)、[runner.ts:144-176](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/runner.ts#L144-L176)、[runner.ts:288-303](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/runner.ts#L288-L303)、[runner.ts:335-388](file:///Users/wukailin/Documents/study/ai-trader/apps/server/src/workers/sync-worker/runner.ts#L335-L388)、[AGENTS.md](../AGENTS.md)

---

## RB-5 研报全文长期 pending / 全部 failed

- **现象**：个股分析页“研报全文”显示多篇待索引或提取失败；`research_report_document` 长期停在 `pending` / `failed`。
- **根因**：
  - `research-worker` 未运行，或无法访问 PostgreSQL / quant。
  - quant 的 `REPORTS_DATA_DIR` 不可写、PDF 上游不可下载、OCR 或 embedding 失败。
  - 单篇任务已耗尽 3 次递增重试；失败-only 研报按设计不会自动再次触发。
- **快速判定**：

  ```sql
  SELECT extract_status, count(*)
    FROM research_report_document
   GROUP BY extract_status;

  SELECT id, report_id, extract_status, last_error, created_at
    FROM research_report_document
   WHERE extract_status IN ('pending', 'failed')
   ORDER BY created_at DESC
   LIMIT 20;

  SELECT state, count(*)
    FROM pgboss.job
   WHERE name = 'research-report-index'
   GROUP BY state;
  ```

- **处置**：
  1. 确认 `research-worker` 日志为 `ready`，并检查 `DATABASE_URL`、`QUANT_URL` 和 `REPORTS_DATA_DIR`。
  2. `pending` 超过 10 分钟且没有 `created/retry/active` job 时，会在 worker 启动或周期巡检时重新入队；确认 worker 已重启后再观察一个巡检周期。
  3. `failed` 不会被自动批量重试；在个股分析页对失败研报点击“重试全文”，或重新提交该标的的 `POST /research-reports/index-window`。
  4. 若 `last_error` 含 `Read-only file system`，修正 quant 报表目录权限后重试；本地非容器运行必须把 `REPORTS_DATA_DIR` 指向可写目录，容器内保持 `/data/reports` 共享卷。
  5. 页面 GET 保持只读，不会因为反复打开页面触发 OCR。
- **预防**：部署时同时启动 server、quant 和 research-worker；保持 `reports-data` 卷挂载；监控 queue `failed/retry` 数量、文档 `failed` 数和 `last_error`。
- **证据来源**：[research-worker](file:///Users/fengyunpeng/Documents/study/ai-trader/apps/server/src/workers/research-worker/index.ts)、[processor.ts](file:///Users/fengyunpeng/Documents/study/ai-trader/apps/server/src/workers/research-worker/processor.ts)、[research-index-service.ts](file:///Users/fengyunpeng/Documents/study/ai-trader/apps/server/src/services/research-index-service.ts)、[RAG 标准](./standards/rag.md)、[验证报告](../openspec/changes/complete-research-rag-pipeline/verification.md)
