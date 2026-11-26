# 行情中心 V1 视觉证据

确认基准：`docs/design/prototypes/initial/quant-workbench-market-center-v1.html`

探索过程稿：`docs/design/prototypes/explorations/quant-workbench-market-center-v1.html`

## 覆盖范围

- `overview/light`、`overview/dark`：总览的成功、加载、空、错误和部分成功状态，包含主要指数与 ETF、成长/防守轮动、市场温度与涨停结构，桌面 `1440×900` 与移动端 `390×844`。
- `overview-rotation/light`、`overview-rotation/dark`：主要资产的“相对强弱”模式，展示 A股宽基、A股成长、黄金和海外权益的排名与相对收益。
- `boards/light`、`boards/dark`：行业与概念板块。第一层为当前排行和热力图，第二层直接展示轮动和异动；点击任意板块进入独立详情。
- `stocks/light`、`stocks/dark`：全市场/自选切换、搜索和全宽行情表；不在列表右侧嵌入重复详情。
- `interactions/stock-detail/light`、`interactions/stock-detail/dark`：点击个股后进入的完整快速行情详情，包含资金结构。
- `interactions/board-detail/light`、`interactions/board-detail/dark`：点击行业或概念后进入的板块详情、轮动证据、资金结构与成分股。
- `interactions/light`、`interactions/dark`：模块点击与键盘左右方向键切换后的焦点状态。

每个目录的 `report.json` 记录控制台错误、横向溢出、图片加载和可读性检查结果。最终标准截图均已通过浏览器检查。

## 生产实现截图

`production/` 保存已落地页面在真实数据下的验收证据：

- 总览：浅色/深色桌面、浅色/深色移动端。
- 板块：行业浅色/深色桌面、行业浅色/深色移动端。
- 个股：浅色/深色桌面、浅色移动端。
- 板块详情：浅色/深色桌面、浅色移动端。
- 个股详情：浅色/深色桌面、浅色移动端，K 线使用项目原有 `klinecharts` 框架。
- 状态证据：总览加载骨架、空自选列表和大类资产部分成功（IXIC 历史不足）直接来自生产页面。

生产数据是验收当时的真实快照。资金流依赖量化数据源；源暂时不可用时，详情页明确显示“暂无资金快照”，不会补零或伪造资金结构。

## 数据说明

档位、涨跌幅、相对收益、资金流、涨停和个股名称均为视觉结构样例，用于检验信息密度、层级和状态表达，不代表当前生产行情或投资建议。

## 评审状态

用户已于 2026-11-24 确认视觉方案。该稿已提升为 `initial/` 基准并完成生产实现；OpenSpec 归档仍需用户单独验收确认。
