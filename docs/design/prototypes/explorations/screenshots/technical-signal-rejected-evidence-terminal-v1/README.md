# 已否决：证据终端视觉探索

> 该稿推翻了当前行情中心主体和导航，不满足“沿用最新视觉设计”的要求，仅保留作过程追溯，不是确认候选。

原型：[quant-workbench-technical-signal-matrix-v1.html](../../quant-workbench-technical-signal-matrix-v1.html)

视觉方向为“证据终端”：保留现有 Apollo 工作台外壳，用市场状态带、层级计数和行式信号矩阵表达诊断链路；行情中心只做摘要和发现，个股分析承载完整 44 项证据。

## 页面覆盖

`light/` 与 `dark/` 各包含：

- `overview-1440x900.png` / `overview-390x844.png`
- `boards-1440x900.png` / `boards-390x844.png`
- `board-detail-1440x900.png` / `board-detail-390x844.png`
- `stocks-1440x900.png` / `stocks-390x844.png`
- `stock-detail-1440x900.png` / `stock-detail-390x844.png`
- `analysis-1440x900.png` / `analysis-390x844.png`
- `gold-1440x900.png` / `gold-390x844.png`

## 状态与交互

- `states-light/` 与 `states-dark/`：加载、空、错误、部分成功，各含桌面与移动端。
- `interactions/`：信号证据展开、低置信筛选和键盘焦点，各含桌面与移动端。

## 检查结果

最终四份目录的 `report.json` 均无控制台错误、加载失败图片、页面级横向溢出、文字过小、对比度不足或嵌套边框提示。

截图使用固定展示数据，仅用于视觉和状态验证，不代表生产接口已返回这些数值。黄金页明确把 XAU/USD 量能信号标记为“不适用”，宏观模型标记为未接入，不使用价格代理冒充真实宏观数据。
