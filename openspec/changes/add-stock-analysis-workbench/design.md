# Design

完整设计见 `docs/superpowers/specs/2026-11-19-stock-analysis-design.md`，决策见 `docs/adr/0005-stock-analysis-and-report-rag.md`。

## Prototype Gate

生产开发前必须先完成独立视觉设计稿：

- 基于默认 V2 原型复制到 `docs/design/prototypes/explorations/`。
- 覆盖真实样例、行情陈旧、无研报、低置信度和 PDF/OCR 失败状态。
- 检查桌面、移动端、浅色、深色、键盘焦点和 reduced motion。
- 用户确认设计稿后，才能开始数据表、provider 或页面代码。

## Key Decisions

- “个股分析”位于市场情报，现有行情详情页提供“深度分析”入口。
- 行情、技术指标、估值分位、历史情景和风险参考区间使用确定性计算。
- 5D / 20D / 60D 输出概率场景和 P10/P50/P90，不输出单一目标价。
- 研报 PDF 存共享持久卷；全文、页文本、分块和向量存 PostgreSQL。
- 研报向量使用本地 `BAAI/bge-small-zh-v1.5` 512 维模型。
- PDF 原生提取失败时使用 `chi_sim + eng` OCR。
- 现有新闻 embedding 查询不复用于研报；建立独立研报检索和页码引用。
- 按需分析标的 + 自选股定时增量同步，避免全市场高频抓取。

## Data Freshness

页面中的每个模块独立返回 `asOf`、`source` 和 `quality`。实时行情不得使用数据库旧快照冒充；研报、财务和估值区间必须显示各自日期。

## Failure Modes

- 实时行情失败：保留最近可用行情并标记陈旧。
- 研报为空：展示“尚无机构覆盖”，估值区间降级或不可用。
- PDF 下载失败：保留元数据和原文链接，不生成全文结论。
- OCR 失败：标记失败并允许重试，不使用低质量文本参与 RAG。
- 一致预期不足：不生成前瞻估值和估值区间。
- 样本量不足：情景概率标记低置信度。

## API Boundary

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

## Database Boundary

- `research_report`
- `research_report_document`
- `research_report_chunk`
- `research_report_forecast`
- `analyst_consensus_snapshot`
- `stock_financial_snapshot`
- `stock_valuation_daily`
- `company_announcement`
- `stock_analysis_snapshot`

## Security

所有研报和 PDF 接口要求登录。第三方请求只在服务端发起，东财必须走统一限流与熔断。PDF 默认通过受控 API 提供，不公开静态目录。
