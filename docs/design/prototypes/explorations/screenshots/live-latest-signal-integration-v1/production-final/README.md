# 技术信号矩阵生产验收截图

采集日期：2026-11-26

环境：本地 Docker production build，`http://localhost:9180`，真实 Better Auth
会话、PostgreSQL 信号快照和 Quant 计算链路。

## 视图

- `1440x900`：桌面主视口。
- `390x844`：移动端主视口。
- `light` / `dark`：应用浅色与深色模式。
- `*-signals.png`：滚动到技术信号诊断区域后的视口截图。

## 页面

- `market-*`：行情中心总览、主要指数、市场温度、A 股宏观状态与信号矩阵。
- `boards-*`：行业板块排行、热力图与可排序技术摘要。
- `board-detail-*`：板块详情与 32 项技术诊断。
- `stocks-*`：全市场个股列表与单列技术摘要。
- `stock-detail-*`：比亚迪快速行情详情、技术标签和 K 线/fund canvas。
- `gold-*`：XAU/USD 黄金分析、32 项技术诊断和量能“不适用”边界。
- `analysis-*`：比亚迪个股分析、价格趋势和完整 44 项技术诊断。
- `market-light-desktop-bottom-fixed.jpg`：桌面端滚到底后无页面级空白。
- `market-light-mobile-bottom-fixed.jpg`：移动端滚到底后无页面级空白。

## 交互证据

- `interaction-light-desktop-keyboard-focus.png`：层级 Tab 的方向键切换与可见焦点。
- `interaction-light-desktop-evidence-expanded.png`：信号证据展开及参数、数据边界、版本时间。

## 检查结果

- 7 个页面在 `1440×900` 与 `390×844` 均无页面级横向溢出。
- 桌面 `1920×1013` 与移动 `390×844` 滚到底后继续 PageDown，
  `window.scrollY` 保持 `0`，不会出现整块空白。
- 页面图片全部加载成功；浏览器 console error 为 0。
- 信号状态不再复用红涨绿跌：已触发使用品牌蓝，已失效使用中性墨色，
  低置信使用黄色警示。
- 移动端信号矩阵使用四列紧凑布局，直接显示名称、状态、当前值和展开操作；
  证据摘要列在展开行中完整呈现。
