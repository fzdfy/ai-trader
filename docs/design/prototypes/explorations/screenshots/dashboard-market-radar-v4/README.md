# 每日看板 A 股主控台 + 跨资产背景 · V4

## 设计方向

A 股主控台承担主要决策：上证/创业板切换、A 股趋势图、确定性风险信号和 AI 追问入口在同一张连续面板内。主控台增加 `510300.SH` 沪深300ETF、`588000.SH` 科创50ETF、`159992.SZ` 创新药ETF 快捷行情；伦敦金与纳指放在独立“跨资产背景”卡，有自己的报价、区间与走势，并明确不进入 A 股信号。今日行动继续作为独立行动区。

## 原型

- `../../quant-workbench-dashboard-market-radar-v4.html`

## 证据

- `standard/light/`、`standard/dark/`：桌面 `1440×900` 与移动端 `390×844`。
- `interactions/light/`、`interactions/dark/`：A 股指数/ETF 切换、A 股 YTD、黄金/纳指 YTD、键盘焦点、图表悬停与 AI 入口。
- `states/light/`、`states/dark/`：单资产缺失、陈旧、证据不足、任务空态/错误、加载和整体错误。
- `states/light/details-*`、`states/dark/details-*`：A 股信号、黄金缺失和今日行动的局部状态。

标准首屏没有控制台错误、横向溢出、图片加载失败或文字对比度告警。打开既有 AI 面板后，截图工具会报告原助手侧栏的小字号和低对比度；该问题继承自基线 AI 面板，不属于本次 ETF 与信号入口新增区域。
