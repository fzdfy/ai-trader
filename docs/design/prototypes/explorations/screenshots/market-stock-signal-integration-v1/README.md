# 已否决：仓库旧原型基准

> 该稿基于仓库旧静态原型，而不是用户指定的线上最新视觉页面，仅保留作过程追溯。

## 原型

- [行情中心增量版](../../quant-workbench-market-center-signals-v1.html)
- [个股分析增量版](../../quant-workbench-stock-analysis-signals-v1.html)

两稿分别从当前确认的行情中心与个股分析基准复制，只在原页面后方追加信号区域，不替换主要指数、市场温度、板块排行、热力图、个股列表、价格趋势和研究摘要。

基准来源按 `docs/design/prototypes/atlas/README.md`：

- 行情中心：`initial/quant-workbench-market-center-v1.html`，Atlas 标记为“生产对齐”。
- 个股分析：`initial/quant-workbench-stock-analysis-v2.html`，Atlas 标记为“确认基准”。

## 设计结果

- 行情中心继续使用现有三模块导航，不新增“黄金”一级 Tab。
- 总览在现有模块下方增加 A 股技术状态。
- 板块列表增加技术触发摘要，板块详情在现有行情、资金、轮动和成分股之后追加 32 项矩阵。
- 个股列表增加技术发现摘要，快速行情详情只显示标签、数据边界和进入个股分析的入口。
- 个股分析保留现有页面，在价格趋势与研究摘要之后插入 44 项完整矩阵。
- 黄金从大类资产轮动进入独立子页面，仍处于“行情中心 / 总览”层级。

## 覆盖

- `market-light/`、`market-dark/`：总览、板块、个股，桌面与移动端。
- `market-board-detail-*`、`market-stock-detail-*`：板块和快速个股详情，桌面与移动端。
- `gold-light/`、`gold-dark/`：XAU/USD 详情，桌面与移动端。
- `stock-analysis-light/`、`stock-analysis-dark/`：最新个股分析基准，桌面与移动端。
- `signals-*`：新增信号区域的独立截图证据。
- `states-light/`、`states-dark/`：加载、空、错误、部分成功。
- `interactions-*`：证据展开、键盘焦点。

## 检查说明

- 行情中心增量稿在截图工具中没有控制台错误、横向溢出、图片加载失败或可读性提示。
- 个股分析增量稿的现有基准本身包含大量 9–10px 辅助文字和既有边框分组提示；这些不是新增信号区引入的，本稿保持最新基准不变。新增矩阵没有横向溢出和控制台错误。
