# 工作流工程标准

## 边界

工作流是用户私有的、可版本化的 DAG。定义、发布版本、运行和节点运行分别写入：

- `workflow_definition`：草稿、启停、当前发布版本。
- `workflow_version`：不可变发布快照。
- `workflow_run`：一次触发及整体状态。
- `workflow_node_run`：节点摘要、结果引用、错误和耗时。

身份只来自 Better Auth 服务端 Session。工作流 API 不接受客户端传入的用户 ID。非创建者读取、运行或取消时统一返回资源不存在。

## 图契约

- 图版本为 `schemaVersion: 1`。
- 恰好一个触发器，动作节点都必须从触发器可达，禁止循环。
- 触发器：`manual`、交易日定时 `schedule`、同步模块成功 `sync_complete`。
- 动作节点：`stock_pool`、`screen`、`backtest`、`review`、`factor_iterate`。
- `symbols[]` 只能从股票池或选股流向回测；回测最多接收 50 个去重标的。
- 草稿允许未通过发布校验；发布时服务端重新执行 Zod 和 DAG 校验。

## 服务输入与输出

服务层位于 `apps/server/src/services/`，不调用服务端自身 HTTP 接口。

| 服务 | 输入 | 输出 / 副作用 |
|---|---|---|
| `runScreening` | 策略、范围、用户 ID、AbortSignal | 选股结果和策略摘要 |
| `runBacktest` | 单标的、策略、日期、PIT `asOf`、AbortSignal | quant 回测 JSON |
| `runBacktestBatch` | `symbols[]` + 单标的参数 | 总数、成功数、失败数、逐标的摘要 |
| `generateReview` | 交易日、AbortSignal | 交易日、复盘 sections、总结和口径快照 |
| `startFactorIteration` | 因子描述和评价参数 | `job_run.id`、轮次 |
| `waitForFactorIteration` | `job_run.id`、AbortSignal、超时 | 最终状态和摘要 |

原选股、回测、复盘和因子路由调用同一服务，保持既有响应协议。

## HTTP 接口

前缀为 `/api/v1/workflows`，全部要求 Better Auth Session。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 活动工作流和最近运行 |
| POST | `/` | 创建空草稿 |
| GET | `/:workflowId` | 草稿与当前发布版本 |
| PATCH | `/:workflowId` | 保存名称、说明和草稿图 |
| POST | `/:workflowId/publish` | 校验并创建不可变版本 |
| POST | `/:workflowId/enabled` | 启停自动触发 |
| DELETE | `/:workflowId` | 归档，不删除运行历史 |
| POST | `/:workflowId/run` | 手动触发 |
| GET | `/:workflowId/runs` | 指定工作流运行历史 |
| GET | `/runs/today` | 当前用户今日运行 |
| GET | `/runs/:runId` | 运行、版本图、节点时间线 |
| POST | `/runs/:runId/cancel` | best-effort 取消 |

错误统一为 `{ "success": false, "error": string }`；状态码使用 400 / 401 / 404 / 409 / 500。

## 执行与调度

- API 只写 `pending` 运行并发送 `workflow-run` 队列任务。
- `worker:workflow` 消费任务并执行 DAG；同一工作流最多一个 `pending|running` 运行。
- 节点只在全部父节点成功后开始；独立分支并行，join 等待全部父节点。
- 节点失败停止下游；取消只阻止后续节点，在途外部请求可能完成。
- 每个节点有统一超时；输出超过 8 KiB 时保存截断预览和业务引用。
- pg-boss schedule 使用 `Asia/Shanghai`；worker 再用交易日历判定是否执行。
- 同步任务成功后按 `jobType` 触发匹配的已发布、已启用工作流。
- 运行历史上限 90 天，worker 每日清理；归档工作流不提前删除历史。

## 验证

纯逻辑与契约测试：

```bash
cd apps/server
npm test
```

使用专用测试数据库运行迁移和约束/服务集成测试：

```bash
cd apps/server
DATABASE_URL=postgres://ai-trader:aitrader123@localhost:5532/aitrader_workflow_check \
WORKFLOW_DB_TESTS=1 \
npm run test:db
```

前端、类型与构建：

```bash
cd apps/web
npm test
npm run check-types
npm run lint
../../node_modules/.bin/vite build
```
