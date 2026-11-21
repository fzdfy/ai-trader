# stock-research-documents Specification

## Purpose

保存研报元数据和 PDF 原文，提取可引用的全文，并通过向量检索向个股分析提供可追溯证据。

## Requirements

### Requirement: Research reports are ingested idempotently

系统 SHALL 通过 `a-stock-data` 规定的研报端点获取元数据和 PDF。

#### Scenario: New report is ingested
- **WHEN** 同步任务发现新的研报
- **THEN** 系统 MUST 保存来源、标题、机构、评级、发布日期、EPS 预测和 PDF 来源
- **AND** 重复同步 MUST 按来源记录键幂等更新

#### Scenario: PDF is downloaded
- **WHEN** 研报有可用 PDF
- **THEN** 系统 MUST 通过统一东财限流入口下载并校验 PDF
- **AND** 相同 SHA-256 文件 MUST NOT 重复存储

### Requirement: PDF full text is extracted and searchable

系统 SHALL 将 PDF 转换为带页码和章节元数据的全文及分块。

#### Scenario: Native text extraction succeeds
- **WHEN** PDF 含可选文本
- **THEN** 系统 MUST 保存页文本、全文、页数和提取版本

#### Scenario: PDF is scanned
- **WHEN** 页文本密度低于阈值
- **THEN** 系统 MUST 使用中英文 OCR 兜底
- **AND** 抽取失败 MUST 标记并可重试

#### Scenario: Report is chunked
- **WHEN** 全文提取成功
- **THEN** 系统 MUST 按章节或页生成带页码的重叠文本块
- **AND** 每块 MUST 记录分块版本

### Requirement: Recent report full text is completed automatically

系统 SHALL 在不阻塞个股分析首屏的前提下，为当前分析标的自动补全最近 30 天研报全文。

#### Scenario: Watchlist report metadata is already scheduled
- **WHEN** 自选股元数据已由收盘后任务写入
- **THEN** 进入分析页 MUST 立即读取本地元数据
- **AND** 系统 MUST 后台排队提取最近 30 天内尚未成功提取的全文

#### Scenario: First visit to a non-watchlist symbol
- **WHEN** 用户首次进入没有本地研报缓存的非自选股分析页
- **THEN** 系统 MUST 后台触发一次最近 12 个月元数据同步
- **AND** 元数据完成后 MUST 自动排队最近 30 天全文提取
- **AND** 同一标的重复进入 MUST NOT 在 24 小时内反复请求上游

#### Scenario: Full-text extraction succeeds or fails
- **WHEN** 研报全文提取成功
- **THEN** 后续任务 MUST 跳过该研报
- **WHEN** 自动提取失败
- **THEN** 系统 MUST 最多重试 3 次
- **AND** 失败 MUST NOT 阻塞其他研报或分析页面

#### Scenario: Multiple extraction tasks are queued
- **WHEN** 多个标的或研报同时等待提取
- **THEN** 系统 SHALL 全局串行处理，同一时间最多提取 1 篇 PDF
- **AND** 当前分析页请求 MUST 优先于自选股后台批次

### Requirement: Report retrieval uses semantic and keyword evidence

研报检索 SHALL 使用独立向量表和可降级的关键词检索。

#### Scenario: User retrieves report evidence
- **WHEN** 用户围绕某个主题检索
- **THEN** 系统 MUST 按标的和可选发布日期过滤
- **AND** 返回研报标题、机构、发布日期、页码、原文片段和相似度
- **AND** Evidence Search MUST 默认返回 Top 8

#### Scenario: Vector retrieval is unavailable or empty
- **WHEN** embedding 失败、向量不可用或语义查询返回空结果
- **THEN** 系统 MUST 保留全文和分块并允许重试
- **AND** 系统 MUST 在返回空结果前尝试关键词检索

#### Scenario: Historical analysis uses reports
- **WHEN** 分析指定历史快照
- **THEN** 检索 MUST 只使用发布日期不晚于快照日期的研报

#### Scenario: Agent generates a RAG answer
- **WHEN** Agent 使用研报工具生成回答
- **THEN** 工具 MUST 最多注入 Top 5 证据
- **AND** 回答 MUST 保留实际使用证据的标题、机构、日期和页码
- **AND** 未完成 Golden Set 评测前 MUST NOT 设置硬相似度阈值

### Requirement: Report documents use controlled storage

PDF 和全文 SHALL 使用受控存储，不公开静态目录。

#### Scenario: User opens a PDF
- **WHEN** 登录用户请求受控 PDF 接口
- **THEN** 系统 MUST 校验会话并返回对应文件
- **AND** 未登录或无权用户 MUST 被拒绝

#### Scenario: Storage is unavailable
- **WHEN** PDF 文件或全文不可用
- **THEN** 系统 MUST 保留研报元数据
- **AND** 页面 MUST 提供原始来源链接或失败状态

### Requirement: Research data follows ingestion scope

研报和财务数据 SHALL 按主动分析标的及自选股同步。

#### Scenario: User analyzes a new symbol
- **WHEN** 标的尚无本地研报缓存
- **THEN** 系统 MUST 按需触发增量同步

#### Scenario: Scheduled sync runs
- **WHEN** 到达收盘后同步时间
- **THEN** 系统 MUST 只更新自选股和有未完成任务的标的
