# research-rag Specification

## Purpose

把研报元数据自动补全为可检索、可引用且可降级的全文证据，并明确 Evidence Search 与 RAG Answer 的行为边界。

## Requirements

### Requirement: Recent reports are indexed automatically

当本轮分析标的的研报元数据可用后，系统 SHALL 自动补全最近 30 天全部研报的全文、分块和向量。

#### Scenario: Recent metadata is available
- **WHEN** 当前标的在最近 30 天存在带 PDF 地址的研报元数据
- **THEN** 系统 MUST 为尚未成功提取的研报入队全文索引

#### Scenario: Existing index is current
- **WHEN** 研报已按相同 `report_id`、提取器版本和分块版本成功索引
- **THEN** 系统 MUST 跳过重复下载、OCR、分块和向量化

#### Scenario: Full-text extraction fails
- **WHEN** 单篇研报提取或向量化失败
- **THEN** 系统 MUST 最多自动重试 3 次
- **AND** 失败 MUST NOT 阻塞其他研报或个股分析首屏

### Requirement: Research indexing runs in a dedicated serial worker

研报索引入队 SHALL 由独立的 durable queue 处理，执行 SHALL 与 API 进程隔离。

#### Scenario: Multiple indexing jobs are queued
- **WHEN** 多个标的或研报等待全文处理
- **THEN** 系统 MUST 全局同时只处理 1 篇 PDF
- **AND** 当前用户分析的标的 MUST 优先于自选股后台批次

#### Scenario: Worker restarts
- **WHEN** worker 在处理队列时重启
- **THEN** 未完成任务 MUST 可恢复或重新入队
- **AND** 系统 MUST 保留可观察的最终失败状态

#### Scenario: User manually requests one report
- **WHEN** 用户对单篇研报请求提取全文
- **THEN** 系统 MUST 使用同一个索引队列
- **AND** MUST NOT 在 API 进程同步执行 OCR 或向量化

### Requirement: Analysis reads do not trigger upstream writes

个股分析读取接口 SHALL 保持只读；全文补全 SHALL 通过独立触发接口入队。

#### Scenario: Analysis page loads
- **WHEN** 用户打开个股分析页
- **THEN** GET 接口 MUST 只读取本地分析、元数据和索引状态
- **AND** 页面 MUST 通过独立 POST 请求提交全文补全意图

#### Scenario: Repeated page entries
- **WHEN** 同一标的在 24 小时内被重复打开
- **THEN** 系统 MUST 复用已有任务或结果
- **AND** MUST NOT 重复请求上游元数据

### Requirement: Research retrieval falls back on empty vector results

研报检索 SHALL 使用向量和关键词混合检索，并在语义结果不可用或为空时降级。

#### Scenario: Semantic evidence is available
- **WHEN** 用户按标的和主题检索
- **THEN** 系统 MUST 优先返回按余弦相似度排序的 Top 8 研报分块
- **AND** 结果 MUST 包含标题、机构、发布日期、页码、片段和相似度

#### Scenario: Semantic evidence is empty or unavailable
- **WHEN** embedding 失败、向量不可用或语义查询返回零条
- **THEN** 系统 MUST 尝试关键词检索
- **AND** 不得把空语义结果直接当作最终结果

#### Scenario: Historical snapshot is requested
- **WHEN** 请求包含 `asOf`
- **THEN** 检索 MUST 只使用发布日期不晚于 `asOf` 的研报

### Requirement: Agent answers cite retrieved report evidence

Agent 的 RAG Answer SHALL 只基于实际检索证据归纳观点，并逐条保留引用。

#### Scenario: Agent answers with report evidence
- **WHEN** Agent 调用研报检索工具
- **THEN** 工具 MUST 最多注入 Top 5 证据
- **AND** 回答 MUST 引用实际证据的标题、机构、日期和页码

#### Scenario: Evidence is insufficient
- **WHEN** 没有足够相关证据支持回答
- **THEN** Agent MUST 明确说明证据不足
- **AND** MUST NOT 虚构研报、页码或原文

#### Scenario: Numeric claim is requested
- **WHEN** 回答涉及价格、技术指标、估值或风险区间
- **THEN** 数字 MUST 来自确定性计算工具
- **AND** LLM MUST NOT 生成目标价或安全价格

### Requirement: Indexing status is observable

系统 SHALL 为当前标的提供可恢复、可轮询的研报全文索引状态。

#### Scenario: Current symbol is indexing
- **WHEN** 最近 30 天研报正在后台处理
- **THEN** 状态 MUST 包含总数、成功数、失败数和当前阶段

#### Scenario: Some reports fail
- **WHEN** 批次结束但存在失败项
- **THEN** 状态 MUST 标记为部分失败
- **AND** 已成功研报 MUST 仍可用于 Evidence Search

#### Scenario: Failed reports are revisited
- **WHEN** 最近 30 天只剩失败研报，没有 pending 或未尝试项
- **THEN** 页面自动打开 MUST NOT 再次入队
- **AND** 用户 MUST 能手动重试失败研报

### Requirement: RAG quality is evaluated before thresholds are fixed

研报检索 SHALL 使用 Golden Set 验证召回、引用和降级，再确定生产阈值。

#### Scenario: Golden Set is evaluated
- **WHEN** 比亚迪和至少一只非自选股完成索引
- **THEN** 系统 MUST 使用不少于 20 条查询-证据样本验证 Top 8 召回和引用正确性
- **AND** 样本 MUST 覆盖无结果、无全文、历史 `asOf` 和错误引用

#### Scenario: Threshold is not yet calibrated
- **WHEN** Golden Set 尚未达到验收标准
- **THEN** 系统 MUST NOT 设置未经证明的硬相似度阈值

### Requirement: News remains outside production RAG

新闻 SHALL 只用于个股关联、时间线和事件阅读，不得被描述为生产 RAG 数据源。

#### Scenario: News is displayed
- **WHEN** 用户查看新闻或统一事件流
- **THEN** 系统 MUST 不生成新闻向量
- **AND** 不得把新闻标题作为研报证据或 RAG Answer 引用
