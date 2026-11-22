# Tasks

## 0. Visual Design Gate

- [x] 0.1 保留前期探索稿，创建 `docs/design/prototypes/explorations/quant-workbench-dashboard-market-radar-v4.html`；验证新文件存在，且 `git diff --exit-code -- docs/design/prototypes/explorations/quant-workbench-daily-dashboard-v3.html` 确认基线原型未被覆盖。
- [x] 0.2 在探索稿中使用真实样例，将 A 股与跨市场拆分为不同视觉区域：A 股主控台包含上证/创业板、沪深300ETF、科创50ETF、创新药ETF、A 股趋势与风险信号，并在信号内提供“追问 AI”入口；伦敦金与纳指使用独立背景卡、独立区间与走势，并明确不进入 A 股信号；覆盖成交量、无成交量、ETF 切换、AI 入口、成功、陈旧、证据不足、单资产缺失、任务空态、整体加载和错误状态。
- [x] 0.3 使用 `oil-ui` 真实浏览器截图流程生成桌面/移动端和浅色/深色截图到 `docs/design/prototypes/explorations/screenshots/dashboard-market-radar-v4/`，并覆盖键盘焦点、两图悬停与降级状态；验证截图和报告无控制台错误、横向溢出、图片加载失败、不可读对比度、焦点丢失或 reduced-motion 违规。
- [ ] 0.4 在增加任何生产实现任务前，将探索稿、截图目录和检查结果提交用户确认；验证用户明确同意 A 股指数/ETF 主控台、跨市场背景卡、图表交互、AI 入口、市场信号、今日行动信息层级和全部降级状态。
