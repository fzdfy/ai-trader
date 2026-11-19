# 个股分析工作台设计

## Intent

为单只 A 股提供可追溯的研究入口，汇总实时行情、历史走势、研报全文、机构预测、财务估值、资金筹码、新闻公告，并在明确时间窗口和证据来源的前提下给出情景预测与风险参考区间。

首期以比亚迪 `002594.SZ` 为验收样例，但功能面向全部 A 股。

## Goals

- 从“市场情报 → 个股分析”进入，支持按名称或代码搜索。
- 将技术面、基本面、资金面、研报观点和事件证据放在同一页面。
- 显示每类数据的来源、快照时间和完整度。
- 提供 5D / 20D / 60D 历史统计情景，不输出确定性目标价。
- 提供组合式“风险参考区间”，分别说明技术、估值和情景区间。
- 研报支持 PDF 存档、全文提取、分块、向量检索和页码引用。
- AI 只归纳结构化数据和检索证据，不直接生成价格数字。

## Non-Goals

- 不承诺收益、不输出保证安全价格或自动买卖建议。
- 不在首期实现组合仓位建议、自动下单和实时消息推送。
- 不把新闻标题直接视为研报观点。
- 不让 LLM 替代确定性指标、统计模型或估值计算。

## Existing Data Findings

- 比亚迪已有标准标的主数据：`002594.SZ / 比亚迪`。
- 现有 quant 行情接口可返回最新价格、PE、PB、市值、换手率等快照。
- 现有数据库保存了比亚迪 2011-06-30 至 2026-08-13 的 3,662 根历史日线；quant 接口可取到最新数据。
- 个股资金流最新历史快照可查，但与实时行情存在时间差。
- 当前新闻表与个股关联覆盖不足。
- 当前数据库没有研报表、财务快照、一致预期、估值历史、PDF 全文或研报向量数据。
- 使用 `a-stock-data` 研报入口实测，比亚迪可检索到 207 篇研报，包含标题、机构、评级、三年 EPS 和 PDF 信息。

## Information Architecture

“个股分析”属于“市场情报”：

```text
工作空间
市场情报
├── 行情中心
├── 个股分析
└── 研报洞察
量化研究
流程自动化
```

- 行情中心：市场、板块和个股行情发现。
- 个股分析：单只股票的证据链、预测和风险区间。
- 研报洞察：跨股票、行业和主题的研报检索。

现有行情详情页保留行情图表，并提供“深度分析”入口进入个股分析页面。

## Visual States

“个股分析”由统一入口承载三个明确状态：

### A. Landing · 未选择股票

- 搜索框是首要操作，支持名称、代码和概念。
- 同屏展示真实自选股、最新每日候选和最近分析空状态。
- 自选股没有行情时显示“行情待同步”，不使用虚构价格。
- 最近没有分析记录时解释记录会自动保存，并提供直接选股入口。
- 页面级导航为 `QUANTILE / 个股分析`。

### B. Detail · 单只股票

- 进入完整证据链页面，首屏先显示资产身份、实时行情和数据完整度。
- 页面级导航为 `QUANTILE / 个股分析 / 股票名称`。
- “加入对比”保留当前股票上下文并进入对比状态。

### C. Compare · 多只股票

- 顶部明确当前对比清单与共同行情时间。
- 先展示同日行情、PE/PB、市值和研报覆盖，再展示详细指标矩阵。
- 缺失预测不做空值排名，也不补造替代数字；只说明不可比较原因。
- 页面级导航为 `QUANTILE / 个股分析 / 个股对比`。
- 点击“个股分析”父级返回 Landing，不增加独立返回按钮。

桌面和移动端都需要验证三种状态的浅色、深色、横向溢出和键盘焦点。

## Page Modules

### 1. Asset Header

- 名称、代码、交易所、所属行业。
- 最新价、涨跌额、涨跌幅、PE、PB、总市值、流通市值。
- 行情时间、数据源、是否停牌或陈旧。
- 加入/移出自选，重新分析。

### 2. Research Summary

- 技术趋势、估值水平、资金方向、机构覆盖和主要风险。
- 明确显示“事实、推断、情景”三种标签。
- AI 生成的每个观点必须链接到指标或研报页码。

### 3. Price And Trend

- K 线、成交量、MA5/10/20/60/120/250。
- MACD、RSI、ATR、波动率。
- 20/60/120 日收益、最大回撤、支撑和压力区间。
- 数据日期与复权口径。

### 4. Research Reports

- 研报数量、机构数量、评级分布、发布时间分布。
- 近三年 EPS 预测中位数、区间和覆盖机构数。
- 最新研报列表、机构、评级、标题、PDF。
- 支持按“估值、盈利、订单、风险、海外”等主题检索全文。
- 检索结果显示研报标题、发布日期、机构、页码和原文片段。

### 5. Scenario Forecast

- 5D / 20D / 60D 三个窗口。
- 每个窗口显示 P10 / P50 / P90 价格区间。
- 上涨、震荡、下跌情景概率。
- 样本量、模型版本、回测命中率和置信度。
- 未达到最小样本或数据完整度时明确标记“低置信度”。

### 6. Risk Reference Range

分别展示：

- 技术区间：支撑、ATR 波动带、压力位。
- 估值区间：一致预期 EPS × 历史 PE 分位。
- 情景区间：历史相似波动状态下的分位结果。

最终合成“风险参考区间”，不命名为“安全价格”。

### 7. Fundamentals And Valuation

- 营收、净利润、EPS、ROE、毛利率。
- 经营现金流、资产负债率、应收账款变化。
- PE/PB/PS/PCF 及历史分位。
- 数据报告期和公告日期。

### 8. Funds And Chips

- 近 1/5/20/60 日主力净流入。
- 超大/大/中/小单结构。
- 筹码获利比例、平均成本、70%/90% 成本区间、筹码峰。
- 融资融券、大宗交易、龙虎榜和解禁事件。

### 9. News And Events

- 个股新闻、公告、研报发布日期统一时间线。
- 标明来源、发布时间和关联依据。
- 重大公告优先显示。

### 10. Evidence And Data Quality

- 每个数据域的来源、最新日期和完整度。
- 缺失数据、抓取失败、OCR 失败和抽取失败。
- 预测和区间计算使用的输入快照。

## Data Sources

新数据源按 `a-stock-data V3.7.1` 的端点与风控规则实现。skill 仅作为开发期知识源，生产运行必须使用仓库代码。

| 数据 | 主源 | 降级/说明 |
|---|---|---|
| 实时行情、PE/PB、市值、换手 | 腾讯 `tencent_quote` | mootdx |
| 历史 K 线 | mootdx / 腾讯 | 百度 |
| 研报元数据、评级、三年 EPS | 东财 `eastmoney_reports` | 无同构备胎 |
| 研报 PDF | 东财 `download_pdf` | 保留原始来源 URL |
| 一致预期 EPS | 同花顺 `ths_eps_forecast` | 东财研报 EPS 聚合 |
| 财务快照 | mootdx `finance` | 同花顺 F10 |
| 财务三表 | 新浪财报三表 | 同花顺 F10 |
| 历史估值 PE/PB/PS/PCF | Baostock | 不支持北交所 |
| 个股资金流 | 东财 `stock_fund_flow_120d` | 新浪资金流 |
| 龙虎榜、解禁、融资融券、大宗、股东户数 | 东财数据中心 | 交易所官方数据 |
| 新闻 | 东财个股新闻 | 财联社、现有新闻缓存 |
| 公告 | 巨潮 | 深交所官方、东财公告 |
| 筹码分布 | 前复权 OHLC + 换手率本地推演 | 结果标注为推演值 |

所有东财调用必须经过现有串行限流和熔断入口。新增 PDF 二进制下载入口不得绕开相同限流。

## PDF And RAG Storage

### Original PDF

- 使用 Docker 持久卷 `reports-data:/data/reports`。
- 路径格式：`{source}/{YYYY}/{MM}/{infoCode}.pdf`。
- 数据库保存 `storage_key`、`sha256`、文件大小、页数和提取状态。
- 原始 PDF 不存 PostgreSQL，也不通过未授权静态目录暴露。

### Text Extraction

1. 下载 PDF，校验 `%PDF` 头和文件哈希。
2. 使用 PyMuPDF/pdfplumber 提取页文本和章节。
3. 文本密度异常时进入 OCR，使用 `chi_sim + eng`。
4. 提取结果保存页码、章节、全文和抽取版本。
5. 抽取失败可重试，不覆盖已成功的同名版本。

### Chunking

- 优先按研报章节切分，其次按页。
- 每块约 800–1200 tokens，重叠约 150 tokens。
- 保留 `page_from`、`page_to`、`section_title` 和原文偏移。
- 同一报告使用 `chunk_version` 支持重新切分。

### Embedding

- 使用本地 `BAAI/bge-small-zh-v1.5`，生成 512 维向量。
- 不依赖外部 embedding API。
- 模型和分词器随 quant 镜像固定版本。
- 检索以向量相似度为主，`pg_trgm` 关键词匹配为辅助。

现有 `news_embedding` RAG 查询表名与数据库实际表不一致，且数据库未配置 `chinese` tsvector。研报 RAG 使用独立表，不复用该缺陷路径。

### Data Tables

#### `research_report`

```text
id, source, source_id, symbol, title, institution, analysts jsonb,
rating, industry, publish_date, pdf_url, raw_json jsonb, fetched_at
unique(source, source_id)
index(symbol, publish_date desc)
```

#### `research_report_document`

```text
id, report_id unique, storage_key, sha256 unique, file_size, page_count,
content_type, full_text, extract_status, extractor_version, extracted_at, last_error
```

`extract_status`: `pending | extracted | needs_ocr | failed`

#### `research_report_chunk`

```text
id, report_id, chunk_index, page_from, page_to, section_title,
chunk_text, embedding vector(512), embedding_model, chunk_version, created_at
unique(report_id, chunk_version, chunk_index)
```

索引：

- HNSW `embedding vector_cosine_ops`
- `(report_id, chunk_index)`
- `pg_trgm` 索引用于标题和正文关键词降级检索

#### `research_report_forecast`

```text
id, report_id, horizon(current|next|next_two), eps, raw_value
unique(report_id, horizon)
```

#### `analyst_consensus_snapshot`

```text
symbol, as_of_date, fiscal_year, eps_min, eps_mean, eps_max,
analyst_count, source, raw_json, fetched_at
primary key(symbol, as_of_date, fiscal_year, source)
```

#### `stock_financial_snapshot`

```text
symbol, report_period, statement_type, source, metrics jsonb,
raw_json jsonb, fetched_at
primary key(symbol, report_period, statement_type, source)
```

#### `stock_valuation_daily`

```text
symbol, trade_date, pe_ttm, pe_static, pb, ps_ttm, pcf,
turnover_rate, trade_status, is_st, source, raw_json
primary key(symbol, trade_date, source)
```

按年分区，索引 `(symbol, trade_date)`。

#### `stock_analysis_snapshot`

```text
symbol, as_of_trade_date, quote_at, model_version, input_hash,
forecast_scenarios jsonb, risk_reference_range jsonb,
evidence_chunk_ids jsonb, data_quality jsonb, computed_at
unique(symbol, as_of_trade_date, model_version, input_hash)
```

## Sync Strategy

- 用户主动分析某标的时按需拉取。
- 自选股每日收盘后增量同步研报、财务、一致预期和估值。
- 研报按 `source_id` 幂等写入；PDF 按 SHA-256 去重。
- 实时行情和 K 线通过现有 quant 接口获取。
- 交易时段分析缓存 30 分钟；收盘后最长缓存 24 小时。
- 新研报、价格、财务或模型版本变化时使分析缓存失效。

## Forecast And Risk Calculation

### Scenario Forecast

- 使用历史复权收益率按波动率和趋势状态分组。
- 对 5D / 20D / 60D 窗口做滚动 bootstrap。
- 输出 P10 / P50 / P90、上涨/震荡/下跌概率和样本量。
- 仅使用预测时点之前已经可见的数据。
- 模型必须做滚动样本外验证。

### Risk Reference Range

```text
technical_range =
  support/resistance from swing lows/highs, moving averages and ATR

valuation_range =
  consensus EPS × historical PE P20/P50/P80

scenario_range =
  historical volatility-conditioned P10/P50/P90

risk_reference_range =
  explainable combination of the three ranges
```

三个子区间分别展示，合成区间只表达风险位置，不构成收益承诺。

## AI And RAG

新增 Agent 工具：

```text
searchResearchReports(symbol, query, asOf?, limit?)
getStockForecast(symbol, horizon)
getRiskReferenceRange(symbol)
getStockFundamentals(symbol)
```

检索结果包含研报标题、机构、发布日期、页码、原文片段和相似度。Agent 生成的观点必须引用这些结果；数值预测只能引用确定性计算结果。

## API Shape

```text
GET  /api/v1/stock-analysis/:symbol
GET  /api/v1/stock-analysis/compare?symbols=...
GET  /api/v1/research-reports?symbol=...
GET  /api/v1/research-reports/:reportId
GET  /api/v1/research-reports/:reportId/pdf
POST /api/v1/research-reports/search
POST /api/v1/research-reports/:reportId/ingest
POST /api/v1/stock-analysis/:symbol/refresh
```

分析响应按模块返回 `data + asOf + source + quality`，允许单模块失败而不阻断整页。

## Security And Compliance

- PDF 和研报内容只对登录用户开放。
- 保存来源、机构和原文链接，不隐藏出处。
- 前端不直接访问第三方研报接口。
- 所有第三方请求由服务端限流并记录失败。
- 原始 PDF 是否允许外部下载取决于来源许可；默认通过受控 API 提供。

## Rollout

1. 数据表和 provider 能力。
2. 研报元数据与 PDF 入库。
3. 全文提取、OCR、分块和向量索引。
4. 财务、一致预期、估值和行情聚合 API。
5. 技术指标、情景预测和风险区间。
6. 个股分析页面与 Agent 工具。
7. 自选股定时同步和监控缓存。
