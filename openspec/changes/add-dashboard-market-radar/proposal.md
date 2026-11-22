# Proposal

## Why

每日看板目前侧重板块广度、资金流、涨停和选股，缺少统一的市场判断、独立 ETF 观察、跨市场背景与今日执行入口。用户已确认 v6 视觉方案：A 股主控台承载指数趋势与信号，右侧并列跨市场背景和主流 ETF，今日行动与今日工作流组成首屏下方的今日执行区。数据必须正式沉淀分钟线，不用临时拼接或虚构数据还原视觉。

## What Changes

- 新增七个固定资产：`000001.SH` 上证指数、`399006.SZ` 创业板指、`510300.SH` 沪深300ETF、`588000.SH` 科创50ETF、`159992.SZ` 创新药ETF、`XAUUSD` 伦敦金现货、`IXIC` 纳斯达克综合指数。
- 在 quant 数据层新增跨资产报价、分钟线和日线能力，腾讯负责指数与 XAU 报价，新浪作为 XAU 分钟线和日线来源。
- 新增独立 PostgreSQL 表保存最新报价、分钟线和日线，不写入 A 股复权与回测表。
- 新增分钟采集任务、日线同步与回填、13 个月分钟保留策略和单资产部分失败处理。
- 新增 `GET /api/v1/dashboard/market-brief`，聚合 A 股指数/ETF、伦敦金、纳指报价，独立 A 股/跨市场区间图表和确定性 A 股市场信号。
- 市场信号只使用上证趋势、市场广度和市场热度；主流 ETF 使用独立 Tab、区间和图表，不改变信号；伦敦金与纳指仅作为跨市场背景。
- 每日看板首屏由 A 股主控台、跨市场背景和主流 ETF 组成；桌面端右侧两卡总高度与左侧一致，移动端单列。
- 今日行动与今日工作流下沉为“今日执行”区域：今日行动只读取 Work Task，今日工作流只读取 Workflow Run，两者不得混用。
- 现有市场主线、市场温度、选股、资讯和复盘继续保留，并分别归入市场证据、研究准备和收盘复盘。
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
- 受影响状态：指数切换、ETF Tab 切换、跨市场 Tab 切换、三组独立区间、成功、陈旧、单资产缺失、信号证据不足、今日行动空/错、桌面/移动端和浅色/深色。
- 已确认视觉稿：`docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v6.html`。
- 已确认截图：`docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/`。

## Impact

- Quant：新增跨资产能力、Provider 方法、schema、解析测试和注册表链。
- PostgreSQL：新增跨资产报价、分钟线、日线表及索引，不改现有 A 股表。
- Server：新增 Market Asset Reader、分钟与日线任务、Market Signal、Market Brief API。
- Worker：新增每分钟采集、日线同步和分钟保留任务。
- Web：每日看板新增首屏组件、TanStack Query hook、ECharts 图和真实 Work Task 列表。
- 运维：新增功能开关、任务观测、数据新鲜度告警和回滚步骤。
- 依赖：复用现有 ECharts，不新增图表库。
