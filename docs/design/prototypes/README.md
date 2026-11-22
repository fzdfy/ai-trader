# Visual Prototypes

本目录保存可重复预览的 HTML 原型，不直接作为生产代码。

## 哪个才是标准设计

- **当前全量入口**是 [`atlas/index.html`](./atlas/index.html)。它把当前确认基准和已落地稿集中到一个可运行目录；它不替代历史文件。
- **最新标准**只以 `initial/` 中的文件以及 [设计标准](../standards/design.md) 明确引用的基准为准，不以目录里最大的版本号判断。
- `explorations/` 中的 `v1`、`v2` 等编号只在同一个功能线内表示迭代顺序，不是全应用版本号。
- 探索稿即使视觉完整，在用户明确确认并复制到 `initial/` 之前也只是候选稿。
- 新旧稿必须并存，不能为了“看起来整洁”覆盖历史确认稿；通过状态表和 `Supersedes` 关系判断取代关系。
- 当前全局工作台标准是 `initial/quant-workbench-assistant-v2.html`；当前个股分析标准是 `initial/quant-workbench-stock-analysis-v2.html`；当前个人工作任务标准是 `initial/quant-workbench-user-work-task-v1.html`。
- 工作任务探索稿 `v1` 是历史设计稿，探索稿 `v2` 是本次确认过程稿；`v2` 已提升为标准，但探索目录中的过程稿保持不动以便追溯。

## 目录

```text
docs/design/prototypes/
├── atlas/
│   ├── index.html # 当前全量单一入口
│   └── README.md  # 基准、状态与覆盖缺口
├── initial/
│   ├── quant-workbench-assistant.html  # 原始稿快照，不直接修改
│   ├── quant-workbench-assistant-v2.html # 当前默认工作台参考原型
│   ├── quant-workbench-stock-analysis-v1.html # 个股分析历史基准
│   ├── quant-workbench-stock-analysis-v2.html # 当前个股分析基准（含价格趋势）
│   └── quant-workbench-user-work-task-v1.html # 已确认的个人工作任务基准稿
├── explorations/
│   ├── quant-workbench-preline.html    # 继承原始稿主题的独立 Preline 探索稿
│   ├── quant-workbench-assistant-v2.html # V2 确认过程稿
│   ├── quant-workbench-daily-dashboard-v3.html # 基于真实数据模块的每日看板设计稿
│   ├── quant-workbench-stock-analysis-v5.html # 个股分析工作台设计稿
│   ├── quant-workbench-stock-content-v1.html # 个股新闻、公告、研报刷新状态设计稿
│   ├── quant-workbench-research-rag-v1.html # 研报全文索引与证据检索状态探索稿
│   ├── quant-workbench-data-governance-v1.html # 已确认的数据治理探索稿
│   ├── quant-workbench-user-work-task-v1.html # 个人工作任务历史设计稿
│   ├── quant-workbench-user-work-task-v2.html # 已确认设计的过程稿
│   ├── quant-workbench-dashboard-market-radar-v6.html # 已确认的 ETF Tab、独立观察卡与今日执行布局
│   ├── screenshots/data-governance-production/ # 数据治理生产页面验收截图
│   └── screenshots/research-rag-production/ # 研报索引生产页面验收截图
└── assets/                         # 预览所需的静态资源
```

原始工作稿位于外部设计输出目录，仓库内保留 checksum 一致的快照：

```text
/Users/dakai/Documents/Codex/2026-11-15/ai-ui/outputs/quant-workbench-assistant.html
```

当前默认参考原型为 `initial/quant-workbench-assistant-v2.html`。它包含四组侧栏、助手抽屉、动态工作流、每日选股候选项和面包屑子页面导航。原始稿快照继续保留，便于追溯设计来源。

## 使用规则

1. 先从 `atlas/index.html` 找到受影响页面，再复制该页当前基准到 `explorations/`。
2. 只在 `explorations/` 中修改，保留历史稿。
3. 通过浏览器检查桌面、移动端、浅色和深色主题。
4. 设计确认后单独更新 `initial/` 基准。
5. 同步更新 `atlas/index.html` 的来源、状态和截图证据。
6. 正式页面使用 Preline UI + Preline Theme，不直接复制静态原型代码。

## 预览

```bash
cd docs/design/prototypes
python3 -m http.server 9090
```

访问：

- `http://localhost:9090/atlas/`（当前全量设计入口）
- `http://localhost:9090/initial/quant-workbench-assistant-v2.html`（默认参考）
- `http://localhost:9090/initial/quant-workbench-stock-analysis-v2.html`（个股分析当前基准）
- `http://localhost:9090/initial/quant-workbench-user-work-task-v1.html?page=daily&view=today`（个人工作任务确认基准）
- `http://localhost:9090/initial/quant-workbench-assistant.html`
- `http://localhost:9090/explorations/quant-workbench-preline.html`
- `http://localhost:9090/explorations/quant-workbench-daily-dashboard-v3.html`（每日看板设计稿）
- `http://localhost:9090/explorations/quant-workbench-stock-analysis-v5.html`（个股分析设计稿）
- `http://localhost:9090/explorations/quant-workbench-stock-content-v1.html?view=detail&content=partial`（个股内容刷新设计稿）
- `http://localhost:9090/explorations/quant-workbench-research-rag-v1.html?view=detail&content=success&state=running`（研报全文索引中状态）
- `http://localhost:9090/explorations/quant-workbench-research-rag-v1.html?view=detail&content=success&state=partial`（研报全文部分失败状态）
- `http://localhost:9090/explorations/quant-workbench-data-governance-v1.html`（数据治理确认稿）
- `http://localhost:9090/explorations/quant-workbench-user-work-task-v1.html?page=daily&view=today`（个人工作任务历史稿）
- `http://localhost:9090/explorations/quant-workbench-user-work-task-v2.html?page=daily&view=today`（个人工作任务确认过程稿）
- `http://localhost:9090/explorations/quant-workbench-dashboard-market-radar-v6.html`（每日看板 v6 确认稿）

探索稿使用 Tailwind CSS 与 Preline CDN。正式应用使用 npm 包和 Vite 构建。

V2 侧栏把导航分为工作空间、市场情报、量化研究和流程自动化；工作流包含预设与自定义流程，不再归入工作空间。`每日选股`提供可通过面包屑返回的候选详情示例。

V3 每日看板设计稿按当前数据库中的真实数据组织市场广度、资金主线、市场温度、每日选股、工作流、资讯和最近复盘，并显式标注各数据域快照日期。

V5 个股分析设计稿覆盖未选股票入口、单股详情和多股对比三种状态；单股详情包含实时行情、价格趋势、研究摘要、情景预测、风险参考区间、研报检索、财务估值、资金筹码和新闻事件，并明确区分事实、推断、情景与缺失状态。含最新价格趋势修复的确认基准已保存为 `initial/quant-workbench-stock-analysis-v2.html`。

数据治理确认稿以研究门禁、来源标准漂移和未解决事故为首屏主角；生产实现保留该方向，并补充资产与契约、质量证据、来源标准、治理任务和数据事故五个子页面。桌面/移动端与浅色/深色真实截图保存在 `explorations/screenshots/data-governance-production/`。

个股内容刷新设计稿沿用已确认的个股分析基准，将“重新分析”定义为新闻、公告和研报的统一下拉动作。状态条分别显示三类来源、数量、时间和降级情况；新闻与事件卡按时间倒序合并新闻、公告和研报。设计覆盖全部成功、部分源降级和单一模块失败，截图保存在 `explorations/screenshots/stock-content-v1/`。

研报 RAG 探索稿沿用个股分析基准，只扩展“研报全文”状态格和研报检索空态。覆盖暂无全文、待索引、索引中、全部成功、部分失败与证据不足；桌面、手机、浅色和深色截图保存在 `explorations/screenshots/research-rag-v1/`。

研报索引生产页面验收覆盖比亚迪真实待索引状态、证据检索空态、移动端和深色模式，截图与浏览器检查报告保存在 `explorations/screenshots/research-rag-production/`。

每日看板 V6 确认稿以 A 股主控台为左侧主视图，右侧并列跨市场背景与主流 ETF 两张 Tab 观察卡，今日行动和今日工作流下沉为独立的今日执行区。桌面端左右总高度与底边严格对齐，移动端自然单列。截图证据保存在 `explorations/screenshots/dashboard-market-radar-v6/`。

个人工作任务设计稿覆盖今日三列看板、收件箱、未来、全部、详情面板、拖拽、空/加载/错误/部分成功，以及桌面/移动端和浅色/深色。生产页面验收截图保存在 `explorations/screenshots/user-work-task-production/`。

个人工作任务 V2 修订稿统一了应用主色、语义表面、Tab 选中态和助手侧栏：浅色模式下助手与页面共用暖白画布，深色模式下统一使用深色面板和边界，不再混用旧橙色、旧青绿色或固定白色表面。确认基准已保存为 `initial/quant-workbench-user-work-task-v1.html`，截图保存在 `explorations/screenshots/user-work-task-v2/`。

主题必须沿用默认参考稿的暖白画布、蓝灰导航、白色内容面板、原始蓝主操作、黄色状态强调与 A 股红涨绿跌语义。
