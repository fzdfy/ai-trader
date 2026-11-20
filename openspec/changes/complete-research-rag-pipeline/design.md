# Design

## Context

现有个股分析页只从 PostgreSQL 读取研报元数据；PDF 全量提取由单篇 API 同步执行。研报分块和向量表已经存在，但当前没有自动补全流程，数据库中也尚无文档、分块或向量。新闻的旧 RAG 模块没有被调用，且查询了错误的表名，必须继续保持隔离。

长期行为约束见 `docs/standards/rag.md`。

## Goals / Non-Goals

**Goals:**

- 自选股复用收盘后元数据同步，非自选股首次分析后台补一次元数据。
- 当前标的最近 30 天全部研报自动补全文和向量，成功项永久跳过。
- 用独立 worker 和 durable queue 保证页面不被 OCR 阻塞，全局并发为 1。
- 语义检索为空时可靠降级关键词，并保留来源、日期和页码。
- 通过 Golden Set 验证检索与引用后，再确定相似度阈值。

**Non-Goals:**

- 新闻 RAG。
- 全市场自动提取全部 PDF。
- LLM 生成价格数值。
- 在本变更中重做个股分析页视觉语言。

## Decisions

### Dedicated research worker and durable queue

新增 `research-worker` 容器，并使用 pg-boss 队列 `research-report-index`。该 worker 同时消费元数据准备任务和单篇全文索引任务，`batchSize: 1` 保证全局串行。

拒绝把 OCR 放进 API 进程：扫描件 OCR 和 BGE 向量化会占用 CPU 与内存，可能拖慢所有请求。拒绝复用 `workflow-worker`：工作流执行与研报索引的失败语义、优先级和重启恢复不同。

任务 payload：

```ts
type ResearchIndexJob =
  | { kind: "metadata"; symbol: string; trigger: "analysis" | "manual" | "recovery" }
  | {
      kind: "report";
      reportId: number;
      symbol: string;
      trigger: "analysis" | "manual" | "recovery";
    };
```

页面触发任务使用更高 `priority`。元数据任务使用 24 小时 `singletonKey`；单篇任务使用 `reportId + extractorVersion + chunkVersion` 作为 `singletonKey`，防止重复入队。

worker 只注册一个 queue handler，在 handler 内按 `kind` 分发，确保 metadata 和 report 任务共享同一个全局并发 1。

### Two-stage ingestion

第一阶段只同步元数据：

- 自选股使用现有 `stock-research-reports` 工作日 `18:10` 任务。
- 非自选股首次进入分析页时，后台入队一次 12 个月元数据同步。

第二阶段在元数据完成后执行：

- 查询 `publish_date >= current_date - 30 days`、有 PDF URL 的研报。
- 对不存在成功文档的研报创建 `pending` 文档占位并入队。
- 单篇任务通过现有 quant 提取接口完成下载、OCR、分块和 BGE embedding。
- 提取成功写 `extracted`，失败写 `failed + last_error`；pg-boss 最多自动重试 3 次，使用 1 分钟起步的指数退避。

已成功文档仅在 `extractor_version`、`chunk_version` 或 embedding model 与当前索引版本不一致时重建。期望版本由 server 配置提供并写入入队 payload，页面读取不依赖 quant 网络。

### Read-only analysis and explicit trigger

`GET /api/v1/stock-analysis/:symbol` 只读，不访问上游。响应增加：

```ts
reportIndex: {
  windowDays: 30;
  total: number;
  pending: number;
  extracted: number;
  failed: number;
  action: "sync_metadata" | "index_reports" | "none";
  observedAt: string;
}
```

前端读取完成后，若 `action !== "none"`，调用：

```text
POST /api/v1/research-reports/index-window
{ "symbol": "002594.SZ", "days": 30 }
```

接口返回 `202` 和任务 ID。状态轮询复用分析查询，存在 pending 时每 3 秒刷新；完成或部分失败后停止轮询。

现有单篇 `POST /api/v1/research-reports/:id/ingest` 改为通过同一队列入队，避免手动提取绕过全局并发限制。已提取报告返回当前状态，不重复执行。

`reportIndex.action` 判定：

- 本地没有元数据或最近同步超过 24 小时：`sync_metadata`
- 最近 30 天存在 pending 或从未尝试全文的研报：`index_reports`
- 仅存在 failed 时不自动重试，保持 `none`，由用户手动重试单篇
- 全部成功且版本一致：`none`

### Persistent status without a new business table

复用 `research_report_document`：

- 入队时创建 `extract_status = pending` 占位行。
- 成功写 `extracted`、页数、全文和提取版本。
- 失败写 `failed` 与 `last_error`。
- `needs_ocr` 保留为 OCR 阶段状态。

状态由最近 30 天研报与该文档表的聚合得到。worker 启动时扫描长期 `pending` 的文档，并按 singleton key 重新入队。

`pending` 超过 10 分钟且没有对应 active job 时视为 orphaned，启动扫描和每 10 分钟巡检会重新入队。

### Hybrid retrieval

研报检索先按 `symbol`、可选 `asOf` 和 `embedding IS NOT NULL` 过滤，再按余弦距离排序。Evidence Search 返回 Top 8；Agent 工具只返回 Top 5。

当 embedding 调用失败、向量不可用或返回零条时，执行关键词检索。关键词结果保持相同输出结构，`similarity` 为 `null`。

首批不设置硬相似度阈值。Golden Set 通过后，将阈值作为规则版本记录；没有证据时返回“证据不足”。

Golden Set 以测试 fixture 保存查询、预期来源 ID / 页码和禁止命中项；自动化测试使用固定分块，真实 PDF 版本作为发布前验收记录，避免 CI 依赖外部网络。

### News stays outside production RAG

新闻不生成向量，不进入 Agent Prompt，不作为研报证据。旧 `agent/mastra/rag/index.ts` 不接入新链路；后续要么删除，要么在新闻 RAG 正式立项时重写。

## Visual Design

状态只扩展现有“研报全文”五格状态项，不新增页面或弹层：

- 空态：`暂无`
- 待处理：`7 篇待索引`
- 进行中：`索引中 3/7`
- 成功：`已索引 7 篇`
- 部分失败：`已索引 5 篇 · 2 失败`

探索稿：[quant-workbench-research-rag-v1.html](/Users/fengyunpeng/Documents/study/ai-trader/docs/design/prototypes/explorations/quant-workbench-research-rag-v1.html)

截图目录：[research-rag-v1](/Users/fengyunpeng/Documents/study/ai-trader/docs/design/prototypes/explorations/screenshots/research-rag-v1)

已覆盖桌面、移动端、浅色、深色、空、待处理、索引中、成功、部分失败和 Evidence Search 空态。生产代码前必须取得用户确认。

关键截图：

- 浅色桌面索引中：`research-rag-v1/light-desktop/running.png`
- 浅色桌面部分失败：`research-rag-v1/light-desktop/partial.png`
- 浅色手机索引中：`research-rag-v1/light-mobile/running.png`
- 浅色手机部分失败：`research-rag-v1/light-mobile/partial.png`
- 深色桌面部分失败：`research-rag-v1/dark-desktop/partial.png`
- 深色手机空态：`research-rag-v1/dark-mobile/empty.png`
- Evidence Search 空态：`research-rag-v1/light-desktop/evidence-empty.png`、`research-rag-v1/light-mobile/evidence-empty-mobile.png`

## Risks / Trade-offs

- **OCR 资源占用** → 独立 worker、并发 1、队列优先当前分析标的。
- **热门股单月研报过多** → 不做任意篇数截断，但串行处理并提供进度；若实际超过 50 篇再评估保护阈值。
- **错误研报长期重试** → 最多 3 次，之后转 `failed` 并保留手动重试。
- **worker 重启任务丢失** → pg-boss 持久化 + 启动时扫描 pending 文档重入队。
- **空向量被误报为无结果** → 空结果与异常都走关键词降级，并记录 mode。
- **低质量 OCR 进入 RAG** → OCR 失败不标 `extracted`，低质量文本不参与检索。
- **Golden Set 过拟合** → 使用两只股票、20+ 查询和负样本，阈值版本化。

## Migration Plan

1. 新增 `research-worker` 容器和 pg-boss 队列，不改变现有分析读取。
2. 上线 pending 文档占位、状态聚合和只读 GET 字段。
3. 上线分析页触发接口和 UI 状态，仍保留单篇手动入口。
4. 切换单篇 ingest 到队列，验证并发和重启恢复。
5. 运行 Golden Set，校准阈值并记录规则版本。
6. 回滚时停止 research-worker 并停止自动触发接口；已提取 PDF、分块和向量保留，不删除数据。

## Open Questions

无。
