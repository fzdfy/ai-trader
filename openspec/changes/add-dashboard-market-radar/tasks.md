# Tasks

## 0. Visual Design Gate

- [x] 0.1 保留历史探索稿并创建 `docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v6.html`；确认 `quant-workbench-assistant.html` 和当前基线未被覆盖。
- [x] 0.2 在 v6 中固化 A 股主控台、跨市场背景、主流 ETF 和今日执行的模块边界；ETF 与跨市场使用独立 Tab 和独立区间，今日行动只读取 Work Task，今日工作流只读取 Workflow Run。
- [x] 0.3 使用 `oil-ui` 生成桌面/移动端、浅色/深色、ETF Tab 键盘切换和今日行动空/错状态截图到 `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/`；标准截图无控制台错误、横向溢出、图片加载失败和小字提示。
- [x] 0.4 用户确认 v6；浏览器实测 `1440×900` 下左侧与右侧组合高度均为 `697.875px`，底边差值为 `0px`。

## 1. Cross-asset data platform

对应计划：`docs/superpowers/plans/2026-11-22-dashboard-market-radar-data-platform.md`

- [x] 1.1 增加 `MarketAssetQuote`、`MarketAssetBar`、三项 market-asset capability 和 router 契约；验证未知资产、错误能力与空结果显式失败。
- [x] 1.2 实现腾讯指数/ETF/XAU/IXIC 报价及 A 股时序，实现新浪 XAU 时序和 Yahoo IXIC 时序解析；验证 fixture、单位、session 和空结果测试。
- [ ] 1.3 新增 `market_asset_quote`、`market_asset_minute_bar`、`market_asset_daily_bar` schema 与 additive migration；验证迁移、唯一键和索引。
- [ ] 1.4 实现 server market-asset storage adapter 与幂等 upsert，隔离股票复权/回测表；验证单资产失败不影响其他资产。
- [ ] 1.5 增加 minute、daily 与 daily-backfill Worker 管道和 cron；验证 A 股交易时段、XAU 跨午夜、IXIC 5 分钟桶和单资产部分成功。
- [ ] 1.6 增加 13 个月分钟保留任务、运行观测与数据质量检查；验证保留边界只删除分钟线。

## 2. Market Brief API

对应计划：`docs/superpowers/plans/2026-11-22-dashboard-market-radar-api.md`

- [ ] 2.1 增加 server 固定资产目录和 Market Asset Reader，查询 quote/minute/daily 并返回质量与 stale reason；验证缺失和过期降级。
- [ ] 2.2 实现 A 股、ETF、跨市场三个独立 range resolver 与图表响应；验证 1D/5D/1M/YTD 不互相影响。
- [ ] 2.3 实现 `dashboard-signal-v1` 确定性信号及证据模板；验证阈值、两项缺失、低置信度和 ETF 不参与分数。
- [ ] 2.4 实现 `GET /api/v1/dashboard/market-brief` 参数校验、并行查询和响应契约；验证 allowlist、400、部分成功和缓存无用户数据。
- [ ] 2.5 增加 feature flag 与旧看板回退契约；验证关闭时前端可继续读取原 `/api/v1/dashboard`。

## 3. Dashboard UI

对应计划：`docs/superpowers/plans/2026-11-22-dashboard-market-radar-dashboard-ui.md`

- [ ] 3.1 增加 Market Brief 查询 hooks、前端类型与市场纯 helper 测试；验证三组 range、ETF Tab 和图表空态。
- [ ] 3.2 增加可访问价格趋势图组件，支持成交量、十字线、键盘和 reduced motion；验证缺失数据不绘制空坐标。
- [ ] 3.3 拆出 `AShareMarketBoard`、`AShareSignalPanel`、`ETFContextCard`、`GlobalContextCard`，实现 Tab 与独立区间；验证 ETF 不改变 SIGNAL。
- [ ] 3.4 增加今日执行查询和 `TodayExecutionSection`，并列展示今日行动与今日工作流；验证排序、空态、错误态和点击入口相互独立。
- [ ] 3.5 集成 `DailyDashboard`，桌面右侧两卡与左侧同高、移动端单列，并保留全部旧模块；验证 feature flag 回退。
- [ ] 3.6 使用真实浏览器完成桌面/移动端、浅色/深色、键盘、缺失/陈旧/部分成功/错误截图；验证无溢出、控制台错误和小字问题。

## 4. Integration and verification

- [ ] 4.1 使用真实资产样例走通采集、入库、Market Brief、ETF Tab、跨市场、今日行动和今日工作流；记录缺失区间与来源时间。
- [ ] 4.2 运行 quant、server、web 的目标测试和全量类型/ lint/ build 检查，写入 `verification.md`。
- [ ] 4.3 对照 v6 复验桌面 `1440×900`、移动端 `390×844`、浅色、深色，并确认左右高度与底边差值为 `0px`。

## Workflow follow-up

- 用户验收完成后执行独立代码审查，再决定是否归档。
- 归档需要用户单独确认，不得由测试通过自动触发。
