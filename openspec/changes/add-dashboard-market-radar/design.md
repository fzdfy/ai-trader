# Design

完整技术设计见 `docs/superpowers/specs/2026-11-22-dashboard-market-radar-design.md`。

## Context

当前每日看板只读取板块广度、资金流、涨停、选股、资讯和复盘，没有统一的跨市场行情。腾讯可提供 A 股指数、A 股 ETF、伦敦金与纳指报价及 A 股时间序列；新浪可提供 XAU 分钟线和日线，Yahoo 可提供纳指 5 分钟/日线；现有数据库没有这些资产的完整历史。项目已有 ECharts、Work Task 和交易日历能力。

## Goals / Non-Goals

**Goals:**

- 为三个固定资产建立正式 Provider、报价、分钟线、日线、质量和保留能力。
- 提供跨资产 Market Brief API、确定性 A 股市场信号和真实今日任务。
- 固定 A 股主控台、独立 ETF 观察卡、跨市场背景卡和今日执行区的内容边界。
- 保持现有每日看板模块继续可用，并支持功能开关回退。

**Non-Goals:**

- 不建设全市场分钟线平台，不新增 ETF、黄金期货、上海金或人民币/克黄金。
- 不把跨资产写入 A 股复权/回测表。
- 不做等权基准、量价事件检测、自动交易或 LLM 自由判断。

## Decisions

### Separate cross-asset provider capabilities and tables

新增 `market_asset_quote/minute/daily` 能力与独立表。替代方案是复用股票 `quote/kline` 和 `bar1d_raw`，但那会把指数、外汇单位、24 小时时段和无复权资产混进 `load_kline` 契约，风险不可接受。

### Use verified providers by asset class

腾讯负责七个资产实时报价，以及 A 股指数和 ETF 的分钟/日线；新浪负责 XAU 分钟和日线；Yahoo 负责 `IXIC` 5 分钟和日线。provider 对不支持资产显式报错，禁止空数组冒充成功。

### Start minute history forward-only and retain 13 months

当前来源没有统一的历史分钟回填能力。分钟从上线后按真实交易时段采集，日线可回填；13 个月足以支持 YTD 与一年比较，七类资产的数据量仍可控。

### Keep user tasks outside shared market cache

Market Brief API 只包含市场数据；前端并行调用现有 Work Task API。这样个人任务不会进入共享缓存，也不需要在行情接口里复制权限逻辑。

### Use deterministic market signal v1

趋势、广度和热度按固定公式计算，标题正文来自证据模板。数据置信度只代表新鲜度和完整度，不代表上涨概率。

### Separate market decision, ETF observation, and cross-market context

A 股主控台只切换上证指数和创业板指，并承载趋势与 SIGNAL。三个主流 ETF 使用右侧独立 Tab 卡、独立区间和图表，不参与信号公式；伦敦金与纳指使用另一张独立背景卡。Market Brief 分别返回 `aShareChart`、`etfChart` 和 `globalChart`，避免不同资产域被误读为同一判断。

### Align observation cards and separate execution domains

桌面端右列把跨市场背景和主流 ETF 两卡拉伸到与左侧 A 股主控台同高，底边对齐；移动端自然单列。今日行动与今日工作流放在首屏下方的今日执行区，桌面并列、移动端单列。今日行动只读取 Work Task，今日工作流只读取 Workflow Run，前端并行请求，不把用户任务混入共享行情缓存。

### Add contextual AI entry to the A-share signal

A 股 SIGNAL 提供“追问 AI”入口。点击后复用现有助手并带入当前 A 股信号、所选指数或 ETF、趋势/广度/热度上下文；助手只负责解释和反证，不自动交易或修改任务。

### Reuse ECharts and existing Preline tokens

A 股图和黄金图都有区间、成交量差异、十字线和图表读屏需求，复用现有 ECharts 比扩展手写 SVG 更合适。不新增图表库。

## Failure Modes

- 单资产取数失败：其他资产继续，失败资产标记 stale/missing。
- 分钟源跨午夜：使用 `timestamptz + session_date`。
- 历史分钟不足：返回缺失区间，不补造。
- Market Signal 核心因子不足：返回中性缺失态，不生成方向。
- Work Task 请求失败：首屏其他模块继续，今日行动显示错误/重试。
- Workflow Run 请求失败：市场与今日行动继续，今日工作流显示错误/重试。
- ETF 图表失败：主控台、跨市场卡和今日执行继续，ETF 卡显示暂不可用。
- 新首屏异常：功能开关回退旧每日看板。

## Visual Design

已确认原型：`docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v6.html`

已确认截图目录：`docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v6/`

必须覆盖：

- A 股主控台：上证、创业板切换
- 主流 ETF 独立卡：沪深300ETF、科创50ETF、创新药ETF 横向 Tab
- 独立伦敦金与纳指跨市场背景卡
- A 股、ETF 与跨市场图各自支持 1D/5D/1M/YTD
- 桌面端左右总高度一致，右侧两卡底边对齐
- A 股成交量与伦敦金无成交量
- Market Signal 成功、证据不足和跨资产背景
- 今日行动与今日工作流并列但数据完全分离
- 今日任务有数据、空态和错误
- 加载、单资产缺失、陈旧和整体错误
- 桌面/移动端、浅色/深色、键盘焦点

视觉稿已于 2026-11-22 经用户确认。生产实现必须沿用 v6 的模块归属、Tab 交互和等高关系。

## Migration Plan

1. 应用 additive migration，创建独立跨资产表。
2. 部署 Provider 与测试端点，不启用分钟任务。
3. 执行日线回填并开始分钟采集。
4. 部署 Market Brief API，保持前端开关关闭。
5. 视觉确认后部署新首屏并开启 `DASHBOARD_MARKET_RADAR_ENABLED`。

回滚时关闭功能开关并停用 market-asset cron；保留已采数据，不删除 A 股表。

## Risks / Trade-offs

- [Public quote endpoints may change] → parser fixtures, source health, explicit stale state.
- [Forward-only minute history starts empty] → visible missing ranges and no backfill fabrication.
- [Cross-midnight gold sessions] → absolute timestamps plus session_date.
- [Cache leakage] → market cache excludes user data.
- [Formula creates false precision] → model version, evidence items and data-confidence semantics.

## Open Questions

无。

## Review Result

- **Reviewer:** 用户
- **Date:** 2026-11-22
- **Result:** approved
- **Blocking items:** 无
- **Scope:** 用户明确选择正式跨资产行情平台 C，确认资产品种、存储、回填、信号、任务和图表行为；随后确认 v6 的 ETF Tab、独立观察卡、今日执行区及左右等高布局。
