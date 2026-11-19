# Verification

日期：2026-11-19  
变更：`add-stock-content-ingestion`  
结论：实现与设计稿一致，新闻、公告、研报的内容刷新、定时同步、治理和质量状态均已完成；允许归档。

## 1. Automated checks

| 范围 | 命令 | 结果 |
|---|---|---|
| Quant 全量 | `.venv/bin/python -m unittest discover -s tests -v` | 18 passed |
| Server 全量 | `DATABASE_URL=... node --import @oxc-node/core/register --test "src/**/*.test.ts"` | 125 tests：98 passed，27 个 DB-gated skipped |
| Server 内容集成 | `ADMIN_DB_TESTS=1 DATABASE_URL=... node --import @oxc-node/core/register --test ...` | 31 passed |
| Server 类型 | `tsgo -b --noEmit` | passed |
| Server lint | `oxlint .` | 0 errors；仍有 18 个既有 warning |
| Web 全量 | `node --test --experimental-strip-types "src/**/*.test.ts"` | 41 passed |
| Web 类型 | `tsgo -b --noEmit` | passed |
| Web lint | `oxlint .` | 0 errors；仍有 6 个既有 warning |
| Web build | `node scripts/generate-knowledge.mjs` + `vite build` | passed；仅有既有大 chunk warning |
| Governance | `node ... scripts/check-governance.ts` | registry 与 catalog current |
| OpenSpec | `node_modules/.bin/openspec validate add-stock-content-ingestion --strict` | valid |

`pnpm build` 被 Corepack 对 `pnpm@9.15.4` 的签名校验阻止，未执行到项目构建；改用同一脚本内的底层命令后构建成功。该失败与代码无关。

内容集成测试覆盖：

- 无股票代码正文仍关联查询标的，多标的不重复关联。
- 新闻、公告重复同步不重复建行；空 Provider URL 生成稳定 `fallback:` 键。
- 研报只保留最近 12 个月且超过 100 篇会继续翻页，公告请求固定 30 天窗口。
- 单模块失败不取消其他模块。
- 公告 `(source, source_url)` 唯一；迁移重复数据时保留最大 `id`。
- 自选股任务只遍历 `watchlist`，单股失败继续下一只，并写 `job_run`。
- 10 张内容表在数据管理与治理契约中可查，全部内容规则为 Tier 1 warning。

## 2. Real upstream verification

使用 `002594.SZ` 于 2026-11-19 验证：

| 能力 | 结果 |
|---|---|
| 东财个股新闻 | 返回 3 条样本，包含 `published_at`、URL 和 `002594.SZ` 关联 |
| 新浪个股新闻备源 | Provider 请求成功，但当前 7×24 页无目标标的中；返回空，不宣称降级有数据 |
| 全市场新闻 | 返回 3 条；修正了真实字段 `showTime`、`code`、`stockList` 的 URL、时间和标的映射 |
| 巨潮公告主源 | `page_size=3` 返回 3 条，含正文页与 PDF URL |
| 东财公告备源 | `page_size=3` 返回 3 条，含公告详情与 PDF URL |
| 东财研报 | 最近 12 个月 `total=14`；样本含中航证券、华安证券、东吴证券及 EPS 预测 |

浏览器真实点击“重新分析”后：

- 新闻 20 条、公告 6 条、研报 41 篇全部成功更新。
- 数据库复核：`news_article_symbol=20`、`company_announcement=6`、`research_report=41`。
- 页面状态条显示三类内容均已更新；研报全文显示 8 篇待提取。

限制：新浪备源是否命中取决于当前全局快讯页；未命中是预期空结果，已保留离线解析测试证明映射逻辑正确。

## 3. Visual verification

确认稿：`docs/design/prototypes/explorations/quant-workbench-stock-content-v1.html`

| 证据 | 路径 |
|---|---|
| 浅色桌面 | `docs/design/prototypes/explorations/screenshots/stock-content-v1/production-desktop-light/page-light.png` |
| 深色桌面（最终） | `docs/design/prototypes/explorations/screenshots/stock-content-v1/production-desktop-dark/page-final.png` |
| 浅色手机（最终） | `docs/design/prototypes/explorations/screenshots/stock-content-v1/production-mobile-light/page-final-mobile.png` |
| 深色手机 | `docs/design/prototypes/explorations/screenshots/stock-content-v1/production-mobile-dark/page-mobile-dark.png` |
| 真实刷新后 | `docs/design/prototypes/explorations/screenshots/stock-content-v1/production-refresh/page-refresh.png` |
| 受控部分失败 | `docs/design/prototypes/explorations/screenshots/stock-content-v1/production-partial-failure/page.png` |
| 统一事件流空态 | `docs/design/prototypes/explorations/screenshots/stock-content-v1/production-events-empty/page-events.png` |
| 统一事件流有数据（最终） | `docs/design/prototypes/explorations/screenshots/stock-content-v1/production-events-populated/page-events-final.png` |

检查结果：

- 桌面和手机均无横向溢出。
- 手机状态条使用两列布局，末项跨列；主动作仍在首屏。
- 浅色、深色均使用项目语义 token，无 raw hex。
- 普通用户访问 `/data-management/sync/modules` 返回 403，属于最小权限预期；页面其余请求正常。
- 统一事件流在新闻数量占优时仍保留新闻、公告和研报三类预览，并按时间重新排序。
- 部分失败截图通过浏览器受控响应生成，验证了公告失败、新闻与研报成功时的模块级提示。
- 截图工具仍报告既有小字号和密集卡片可读性提示；本次新增状态条已改为 11px，并移除外层重复边框。

## 4. Migration and rollback

迁移：`apps/server/migrations/0037_stock_content_ingestion.sql`

前向行为：

1. 对 `(source, source_url)` 相同的公司公告，只保留最大 `id`。
2. 创建唯一索引 `company_announcement_source_url_unq`。

已在本地 PostgreSQL 成功应用，集成测试验证：

- 同源同 URL 第二次插入返回 `23505`。
- 同 URL 不同来源可共存。
- 迁移夹具中的旧重复行被确定性删除，只保留最新行。

回滚：

```sql
DROP INDEX IF EXISTS "company_announcement_source_url_unq";
```

唯一索引可安全回滚；迁移删除的历史重复行不能由降级 SQL 恢复。生产执行前必须备份 `company_announcement`，回滚后如需恢复历史重复行只能从备份还原。

## 5. Known limitations

- 自选股定时同步固定为新闻 20 条、公告 30 天、研报 12 个月；不抓全市场内容。
- PDF 全文仍由用户按单篇触发，不自动提取所有研报。
- 内容质量告警不阻断研究门禁。
- 新浪个股新闻备源只搜索当前 7×24 返回页；罕见标的可能无命中。
