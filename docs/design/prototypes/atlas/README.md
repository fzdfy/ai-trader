# Current Design Atlas

`index.html` 是项目当前全部已确认/已落地视觉设计的单一浏览入口。它回答“现在产品长什么样”，不负责保存每一次功能迭代过程。

## 当前基准

| 范围 | 当前来源 | 状态 |
|---|---|---|
| 全局工作台 | `initial/quant-workbench-assistant-v2.html` | 确认基准 |
| 每日看板 | `explorations/quant-workbench-dashboard-market-radar-v6.html` | 已确认落地，市场雷达与今日执行 |
| 行情总览 | `explorations/live-market-signals-judgments-v1.html` | 生产对齐，含 32 项技术判断 |
| 板块与板块详情 | `explorations/live-market-boards-signals-v1.html`、`explorations/live-market-board-detail-signals-judgments-v1.html` | 生产对齐 |
| 个股列表与快速行情 | `explorations/live-market-stocks-signals-v1.html`、`explorations/live-market-stock-detail-signals-v1.html` | 生产对齐，分页与技术摘要 |
| 个股分析 | `explorations/live-stock-analysis-signals-judgments-v1.html` | 生产对齐，含 44 项技术判断 |
| 黄金分析 | `explorations/live-market-gold-signals-judgments-v1.html` | 生产对齐 |
| 个人工作任务 | `initial/quant-workbench-user-work-task-v1.html` | 确认基准 |
| 数据管理 | `explorations/quant-workbench-data-management-v1.html` | 已落地，基准提升待后续整理 |
| 数据治理 | `explorations/quant-workbench-data-governance-v1.html` | 已落地，基准提升待后续整理 |

## 与版本目录的关系

- `atlas/`：唯一的当前全量入口，只引用当前标准和已落地稿。
- `initial/`：确认基准。历史文件不覆盖；当局部探索升级为基准时，新建递增版本。
- `explorations/`：功能线过程稿。`v1`、`v5` 只表示功能内部迭代，不代表全应用版本。
- `explorations/screenshots/`：页面状态与视觉门禁证据，不替代可运行原型。

## 维护规则

1. 新视觉需求从 Atlas 当前页指向的基准稿复制到 `explorations/`。
2. 局部探索确认并落地后，先把当前基准提升到 `initial/` 的新版本。
3. 在 Atlas 清单中把对应页面切到新基准，并补充必要状态证据。
4. 历史文件永久保留，不通过删除旧版本制造“只有一个文件”的假象。
5. 重大阶段或不可回滚展示需要长期追溯时，另存日期快照。
6. 尚未确认的探索稿不得进入 Atlas；统一个股工作台和五日预测在用户确认前保持排除。

## 2026-11-27 回填

- 每日看板切换到已确认并落地的市场雷达 v6。
- 行情总览、板块、个股列表、快速行情、个股分析和黄金切换到
  2026-11-26 生产验收稿及实拍。
- 本轮回填不包含 `unified-stock-workspace-v1` 和
  `stock-five-day-forecast-v1`；它们仍是待确认探索，后续视觉设计以本 Atlas
  更新后的当前基线为起点。
- 研报 RAG 状态截图仍来自技术信号整合前的已确认组件稿；这些条目已明确标记为
  “历史状态证据”，当前完整页面以“个股分析”的生产对齐稿为准。

## 视觉验收

- `../explorations/screenshots/current-design-atlas/latest-2026-11-27/light/page-1440x900.png`
- `../explorations/screenshots/current-design-atlas/latest-2026-11-27/light/page-390x844.png`
- `../explorations/screenshots/current-design-atlas/latest-2026-11-27/dark/page-1440x900.png`
- `../explorations/screenshots/current-design-atlas/latest-2026-11-27/dark/page-390x844.png`
- `../explorations/screenshots/current-design-atlas/latest-2026-11-27/pages/`
- `../explorations/screenshots/current-design-atlas/latest-2026-11-27/pages-dark/`
- `../explorations/screenshots/current-design-atlas/latest-2026-11-27/state-entries-light/`

浏览器检查覆盖每日看板、行情总览、板块行情、板块详情、个股列表、快速行情详情、
个股分析和黄金分析。8 个最新主页面无控制台错误、横向溢出、图片加载失败或
`oil-ui` 可读性提示。状态证据卡使用可点击边框网格，检查会保留一条结构性
`boxedGroups` 提示；其内容、链接、主题和移动端均通过。深色模式会同步切换 Atlas
外壳、iframe 原型和独立打开链接。

独立 closure review：**无阻断项，可交付**。Atlas 内部引用 71 个，缺失 0；
`unified-stock-workspace-v1` 和 `stock-five-day-forecast-v1` 未加入当前条目。

## 当前覆盖缺口

Atlas 覆盖现有已确认页面和主要交互状态，但生产应用中仍有尚未沉淀独立视觉稿的页面，例如主题设置和部分系统子页面。缺口应在后续设计中逐项补齐，不能临时复制旧页面冒充当前设计。
