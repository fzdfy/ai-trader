# Current Design Atlas

`index.html` 是项目当前全部已确认/已落地视觉设计的单一浏览入口。它回答“现在产品长什么样”，不负责保存每一次功能迭代过程。

## 当前基准

| 范围 | 当前来源 | 状态 |
|---|---|---|
| 全局工作台 | `initial/quant-workbench-assistant-v2.html` | 确认基准 |
| 个股分析 | `initial/quant-workbench-stock-analysis-v2.html` | 确认基准，包含最新价格趋势稿 |
| 个人工作任务 | `initial/quant-workbench-user-work-task-v1.html` | 确认基准 |
| 数据管理 | `explorations/quant-workbench-data-management-v1.html` | 已落地，基准提升待后续整理 |
| 数据治理 | `explorations/quant-workbench-data-governance-v1.html` | 已落地，基准提升待后续整理 |
| 每日看板 | `explorations/quant-workbench-daily-dashboard-v3.html` | 生产对齐，基准提升待后续整理 |

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

## 视觉验收

- `../explorations/screenshots/current-design-atlas/review-light-desktop/page.png`
- `../explorations/screenshots/current-design-atlas/final-dark-desktop-v2/page-深色.png`
- `../explorations/screenshots/current-design-atlas/final-light-mobile-v2/page.png`
- `../explorations/screenshots/current-design-atlas/final-dark-mobile-v2/page-深色.png`
- `../explorations/screenshots/current-design-atlas/review-stock-detail-desktop/page.png`
- `../explorations/screenshots/current-design-atlas/review-chart-evidence-desktop/page.png`
- `../explorations/screenshots/current-design-atlas/review-mobile-navigation/page-目录.png`

浏览器检查无控制台错误、横向溢出或图片加载失败。剩余提示只有工具栏内部的边框分组，属于预览容器与分段控件的结构，不是页面分组错误。

## 当前覆盖缺口

Atlas 覆盖现有已确认页面和主要交互状态，但生产应用中仍有尚未沉淀独立视觉稿的页面，例如主题设置和部分系统子页面。缺口应在后续设计中逐项补齐，不能临时复制旧页面冒充当前设计。
