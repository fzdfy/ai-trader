# Proposal

## Why

每日看板目前侧重板块广度、资金流、涨停和选股，缺少跨资产行情、可解释的市场信号与今日行动的统一首屏。用户已确认以图片方案升级首屏，只保留上证指数、创业板指和伦敦金现货，并要求正式沉淀分钟数据，而不是用临时拼接或虚构数据还原视觉。

## What Changes

- 新增七个固定资产：`000001.SH` 上证指数、`399006.SZ` 创业板指、`510300.SH` 沪深300ETF、`588000.SH` 科创50ETF、`159992.SZ` 创新药ETF、`XAUUSD` 伦敦金现货、`IXIC` 纳斯达克综合指数。
- 在 quant 数据层新增跨资产报价、分钟线和日线能力，腾讯负责指数与 XAU 报价，新浪作为 XAU 分钟线和日线来源。
- 新增独立 PostgreSQL 表保存最新报价、分钟线和日线，不写入 A 股复权与回测表。
- 新增分钟采集任务、日线同步与回填、13 个月分钟保留策略和单资产部分失败处理。
- 新增 `GET /api/v1/dashboard/market-brief`，聚合 A 股指数/ETF、伦敦金、纳指报价，独立 A 股/跨市场区间图表和确定性 A 股市场信号。
- 市场信号只使用上证趋势、市场广度和市场热度；ETF 用于切换 A 股行情视图，不改变信号；伦敦金与纳指仅作为跨市场背景。
- 每日看板首屏增加行情条、主趋势图、市场信号和今日 Work Task；现有市场主线、市场温度、选股、工作流、资讯和复盘继续保留。
- 新增功能开关，允许回退到当前每日看板。

## Capabilities

### New Capabilities

- `cross-asset-market-data`: 固定 A 股指数与伦敦金的 Provider、存储、分钟采集、日线回填、质量和保留边界。
- `dashboard-market-brief`: 跨资产看板 API、确定性市场信号、区间图与今日行动呈现。

### Modified Capabilities

无。

## Visual Design Impact

Visual design: required.

- 受影响页面：每日看板 `/home`。
- 受影响状态：A 股指数与 ETF 切换、A 股与跨市场图各自 1D/5D/1M/YTD、成功、陈旧、单资产缺失、信号证据不足、任务空态、桌面/移动端和浅色/深色。
- 视觉参考：用户提供的行情雷达图片，以及 `docs/design/prototypes/explorations/quant-workbench-daily-dashboard-v3.html`。
- 生产实现前必须创建新的 exploration，完成桌面/移动端、浅色/深色、键盘和降级状态截图，并取得用户确认。

## Impact

- Quant：新增跨资产能力、Provider 方法、schema、解析测试和注册表链。
- PostgreSQL：新增跨资产报价、分钟线、日线表及索引，不改现有 A 股表。
- Server：新增 Market Asset Reader、分钟与日线任务、Market Signal、Market Brief API。
- Worker：新增每分钟采集、日线同步和分钟保留任务。
- Web：每日看板新增首屏组件、TanStack Query hook、ECharts 图和真实 Work Task 列表。
- 运维：新增功能开关、任务观测、数据新鲜度告警和回滚步骤。
- 依赖：复用现有 ECharts，不新增图表库。
