# 个股分析工作台验证报告

日期：2026-11-21  
验证标的：`002594.SZ`  
当前状态：全部任务已通过验证。

## 1. 自动化检查

| 检查 | 结果 |
|---|---|
| quant unittest | 27 passed |
| server TypeScript | passed |
| server full test | 141 passed，50 skipped（需额外 DB 门禁的用例另跑） |
| server 数据库集成 | 31 passed |
| 当前财年一致预期 DB 测试 | 1 passed |
| web 个股分析定向测试 | 10 passed |
| OpenSpec strict | passed |
| oxlint | 0 warnings，0 errors |
| oxfmt | all matched files formatted |
| `uv lock --check` | passed |

定向数据库集成覆盖：

- 新闻、公告、研报幂等入库；
- 研报游标增量（首次 12 个月、后续 7 天重叠）；
- 一致预期、财务双来源、估值历史幂等 upsert；
- 一致预期重复业务键去重并由最后一条覆盖；
- watchlist 基本面任务、全文低优先级入队和失败隔离；
- 研究索引成功跳过、失败状态、10 分钟恢复和重试契约。

## 2. `002594.SZ` 端到端证据

真实 API：`GET /api/v1/stock-analysis/002594.SZ`，HTTP 200。

| 模块 | 结果 |
|---|---|
| 实时行情 | `quant-live`，2026-11-21，最新价 79.68，PE 22.97，PB 2.92，质量 `available` |
| K 线 | 返回 120 根，质量 `available` |
| 研报 | 本地 41 篇；最近 30 天 7 篇 |
| 全文与向量 | 7 篇提取成功，22 个分块，22 个非空向量 |
| 公告/新闻 | 公告 5 条、新闻 8 条 |
| 一致预期 | THS 2026 年 EPS 均值 4.10，区间 3.73–4.94，33 家机构 |
| 财务 | 新浪 2026-09-30 利润表，质量 `available` |
| 估值 | Baostock 2026-11-20，PE TTM 22.97，PB 2.92 |
| 情景预测 | 5D/20D/60D 共 3 组 |
| 风险参考区间 | `available`，低 73.0375、高 157.6036 |
| 分析快照 | 本地持久化记录存在 |

真实语义检索使用库内目标研报向量执行 `hybrid-keyword-v1` 路径，返回：

- `AP202611021831322093`；
- 标题“单车盈利企稳，海外本地化贡献利润弹性”；
- 发布日期 2026-11-02；
- 页码 1–3；
- 相似度 1.0（查询向量取自同一真实分块，仅用于验证语义 SQL 与引用契约）。

宿主 Python 3.14 缺少兼容的 `onnxruntime`/`fastembed` wheel，本地在线 query embedding 不可用；检索按设计降级关键词。项目 quant 容器已具备 `fastembed`，生产运行不依赖宿主 venv。

## 3. 失败场景

| 场景 | 证据 | 结果 |
|---|---|---|
| 无研报 | `fresh metadata for a zero-report symbol` | `none` 终态，不循环请求上游 |
| 扫描件 OCR | quant 容器生成纯图片 PDF，Tesseract `chi_sim+eng` | OCR 返回 `SCANNEDREPORTOCR2026` |
| 低文本密度 | `needs_ocr` 单元测试 | 正确触发 OCR 判定 |
| 行情陈旧 | `marks a stale stored quote as low quality` | 数据库兜底并标记 `low` |
| 一致预期不足 | valuation range 空输入/空历史测试 | 不生成估值区间 |
| PDF/提取失败 | `report processing writes current chunks or persists failure` | 写入 `failed + last_error`，不污染证据 |
| 单模块失败 | `one failed content module does not cancel the other modules` | 其他模块继续完成 |

## 4. 修复项

真实验证期间发现并修复：

1. 同花顺页面同时包含 EPS 与净利润预测表；解析器现只选择 EPS 结构表，避免把 374.16 等净利润指标误当 EPS。
2. 一致预期批次可能出现重复业务键；服务端按 `(as_of_date, fiscal_year, source)` 去重，财务和估值也按各自主键去重。
3. 分析 API 原按财年降序取最新预测，会误用 2028 年 EPS；现过滤当前财年并升序选择最近的当年/未来年度。

## 5. 部署注意

- `apps/quant/uv.lock` 已锁定 `baostock 0.9.4`；运行中的旧 quant 镜像需重建后才会包含新增估值依赖。
- 宿主 Python 3.14 的完整 `uv sync` 受既有 `onnxruntime 1.32.0` 平台 wheel 限制；本次仅向本地 venv 安装 baostock 完成验证，未修改锁文件的依赖解析策略。

## 6. 研报索引状态视觉验收

6.8 沿用已确认的 `quant-workbench-research-rag-v1.html` 视觉基准，生产实现为个股分析五状态条中的“研报全文”项：

- 索引中：`索引中 3/7` 或 `N 篇待索引`，warning 状态并继续轮询；
- 已完成：`已索引 N 篇`，success 状态；
- 部分失败：`已索引 N 篇 · M 失败`，warning 状态并保留可检索内容；
- 全部失败：error 状态并提供单篇重试；
- 无全文：neutral 空态，不伪装成可检索内容。

视觉证据：

- [浅色桌面](../../../docs/design/prototypes/explorations/screenshots/research-rag-production/pending-light-desktop.png)
- [深色桌面](../../../docs/design/prototypes/explorations/screenshots/research-rag-production/pending-dark-desktop.png)
- [浅色移动端](../../../docs/design/prototypes/explorations/screenshots/research-rag-production/pending-light-mobile.png)
- [索引空态/检索空态](../../../docs/design/prototypes/explorations/screenshots/research-rag-production/evidence-empty-light-desktop.png)

实际文件位于 `docs/design/prototypes/explorations/screenshots/research-rag-production/`；Web 定向测试覆盖 pending、active、partial、complete、failed 和空/陈旧状态，10/10 passed。
