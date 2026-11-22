# 每日看板模块归位 · V6

## 设计方向

- 左侧 A 股主控台只承载指数切换、趋势图和 A 股 SIGNAL。
- 右侧将“跨市场背景”和“主流 ETF”组织为两张同级独立观察卡，总高度与左侧 A 股主控台一致并上下对齐；ETF 使用三只标的横向 Tab 切换，不进入 A 股信号。
- 今日行动与今日工作流下沉为一条“今日执行”区域，桌面左右并列、移动端单列。两者分别保留 Work Task 与 Workflow Run 的数据边界。
- 市场主线、市场温度、每日选股、资讯增量和最近复盘继续保留，并按市场证据、研究准备、收盘复盘组织。

## 原型

- `../../quant-workbench-dashboard-market-radar-v6.html`

## 证据

- `standard/light/`、`standard/dark/`：桌面 `1440×900` 与移动端 `390×844`。
- `interactions/light/`：创新药 ETF + YTD 切换、ETF Tab 键盘切换。
- `details/etf-mobile-light/`、`details/etf-mobile-dark/`：移动端主流 ETF Tab 与走势。
- `details/execution-light/`、`details/execution-mobile-light/`、`details/execution-dark/`：今日行动与今日工作流的浅色、深色、桌面并列和移动端单列。
- `states/execution-light/`：今日行动空态与错误态。

## 生产页面验收（Mock API）

- `production-mock/light/`、`production-mock/dark/`：生产 React 页面桌面与移动端；仅 `/api` 使用临时 mock 数据，组件、样式和交互均来自正式代码。
- `production-mock/interactions/`：ETF Tab 键盘切换。
- `production-mock/details/execution/`：今日行动与今日工作流生产组件。
- 实测生产组件桌面左右高度均为 `775.5px`，底边差值 `0px`。

## 检查结果

标准桌面与移动端、浅色与深色截图均无控制台错误、横向溢出、图片加载失败和小字提示。桌面首屏仍保留一项页面级“多卡片分组”启发式提示，来自 A 股主控台、跨市场、ETF 和固定导航卡同时出现在首屏；右侧两张观察卡内部没有该提示。

`1440×900` 浏览器实测：左侧 A 股主控台与右侧两卡组合高度均为 `697.875px`，底边差值为 `0px`。

本轮只验证视觉探索稿，未修改生产代码和业务数据口径。
