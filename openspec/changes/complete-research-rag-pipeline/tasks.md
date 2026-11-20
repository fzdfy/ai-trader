# Tasks

## 0. Visual Design Gate

- [x] 0.1 从 `quant-workbench-stock-content-v1.html` 创建独立探索稿，覆盖研报全文为空、待索引、索引中、全部成功、部分失败和证据不足状态；验证桌面、移动端、浅色和深色截图无横向溢出、控制台错误和不可读状态
- [x] 0.2 用户确认“研报全文”状态格的文案、颜色语义、进度表达和 Evidence Search 空态；确认前不得创建生产代码实现任务

## 1. Research Queue and Worker

- [x] 1.1 新增 `research-report-index` pg-boss 队列、metadata/report 联合 payload、singleton key 和优先级；验证重复入队被合并
- [x] 1.2 新增独立 `research-worker` 与 Docker 服务，单 handler 按 payload 分发且全局并发 1；验证两类任务串行执行
- [x] 1.3 实现 worker 重启恢复和 pending orphaned 巡检；验证未完成任务重新入队且最终失败可观察

## 2. Metadata and Index Trigger

- [x] 2.1 实现当前标的索引状态聚合及 `sync_metadata/index_reports/none` 判定；验证空、pending、failed、complete 和版本不匹配状态
- [x] 2.2 新增 `POST /research-reports/index-window` 和只读状态字段；验证任意个股、24 小时 metadata 去重、认证和非法参数
- [x] 2.3 将非自选股首次分析接到 metadata 后台任务；验证页面首屏不等待上游、重复进入不重复请求

## 3. Full-Text Indexing

- [x] 3.1 入队时为最近 30 天研报创建或复用 pending 文档占位；验证成功项跳过、失败项重试和版本变化重建
- [x] 3.2 将单篇 ingest 从同步执行改为同一队列入队；验证 202、去重、已提取报告和 API 不执行 OCR
- [x] 3.3 实现提取成功/失败状态、页数/全文/分块写入与 3 次递增重试；验证单篇失败不影响同批其他研报

## 4. Retrieval

- [x] 4.1 研报 API 在语义失败或空结果时执行关键词降级；验证语义成功、异常、空集合和 `asOf`
- [x] 4.2 Agent 研报工具使用相同降级语义并注入 Top 5；验证引用字段、证据不足和禁止虚构
- [x] 4.3 Evidence Search 默认 Top 8 并返回相似度/关键词模式；验证越权、标的隔离和空态

## 5. Stock Analysis UI

- [x] 5.1 扩展分析响应和 hook 的 `reportIndex` 状态，页面读取后通过独立 POST 触发；验证成功、部分失败、失败和空数据
- [x] 5.2 在现有“研报全文”状态格实现暂无、待索引、索引中、成功和部分失败；验证桌面/移动端浅色深色与确认稿一致
- [x] 5.3 实现 pending 时 3 秒轮询、完成停止轮询和 Evidence Search 空态；验证无请求风暴和无重复触发

## 6. Quality and Golden Set

- [x] 6.1 为 pending/orphaned/failed 文档和队列任务增加可观察日志与状态；验证重启、重试和部分失败证据
- [x] 6.2 建立比亚迪与非自选股不少于 20 条查询-证据 fixture；验证正样本召回、负样本、历史 `asOf` 和引用正确性
- [x] 6.3 记录 Golden Set 结果并版本化检索参数；验证设置阈值前后行为可追溯

## 7. Integration Verification

- [x] 7.1 运行 server/web/quant 测试、类型检查、lint、生产构建和 OpenSpec 严格校验；记录通过数、跳过项和既有 warning
- [x] 7.2 使用真实比亚迪和贵州茅台完成元数据、最近 30 天全文、向量、Evidence Search 和 Agent 引用验证
- [x] 7.3 验证 worker 重启恢复、并发 1、部分失败不阻塞页面以及关键词降级
- [x] 7.4 生成测试报告和截图证据，更新 RAG 标准、数据链路与运行手册

## Workflow follow-up

- 完成独立代码审查、验证报告和 OpenSpec 归档。
