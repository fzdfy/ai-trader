# Spec Delta

## Purpose

保存研报元数据和 PDF 原文，提取可引用的全文，并通过向量检索向个股分析提供可追溯证据。

## ADDED Requirements

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

### Requirement: Report retrieval uses semantic and keyword evidence

研报检索 SHALL 使用独立向量表和可降级的关键词检索。

#### Scenario: User retrieves report evidence
- **WHEN** 用户围绕某个主题检索
- **THEN** 系统 MUST 按标的和可选发布日期过滤
- **AND** 返回研报标题、机构、发布日期、页码、原文片段和相似度

#### Scenario: Vector generation fails
- **WHEN** embedding 失败
- **THEN** 系统 MUST 保留全文和分块并允许重试
- **AND** 关键词检索 MAY 继续提供降级结果

#### Scenario: Historical analysis uses reports
- **WHEN** 分析指定历史快照
- **THEN** 检索 MUST 只使用发布日期不晚于快照日期的研报

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
