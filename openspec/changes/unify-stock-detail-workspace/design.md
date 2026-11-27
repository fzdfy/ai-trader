# Design

## Context

动机见 [proposal.md](./proposal.md)，用户可见行为见
[stock-workspace/spec.md](./specs/stock-workspace/spec.md)。

当前实现事实：

- `/home/market/stock/$symbol` 在
  `apps/web/src/routes/home/market/stock/$symbol.tsx` 内维护 K 线图表、行情摘要、
  资金结构和快捷入口。
- `/home/market/analysis/$symbol` 在
  `StockAnalysisDetail.tsx` 内维护股票身份头、研究摘要、预测、风险、技术信号、
  财务、研报和事件。
- 快速详情使用 `useLatestQuotes`、`useFundFlowHistory` 和
  `useTechnicalSignalSnapshot`。
- 深度详情使用 `useStockAnalysisQuery`，该请求聚合数据较多。
- `/home/market/analysis` 是搜索 Landing，`/home/market/analysis/compare` 是独立比较页。
- 当前导航工具只按 pathname 判断页面归属，模式来自 query。

## Goals / Non-Goals

**Goals:**

- 让一只股票只有一个规范详情 URL 和一个身份头。
- 默认只加载快速模式需要的数据。
- 深度研究组件按需挂载，查询与快速详情相互隔离。
- 旧链接和内部入口兼容，模式切换可用前进/后退恢复。

**Non-Goals:**

- 不重新设计深度研究内部的业务模块。
- 不改变现有聚合 API 响应、预测计算和权限；只新增一个读取既有 5/20/60 日结果的
  轻量预测端点，供快速 K 线使用。
- 不合并搜索 Landing 或多股对比。
- 不把深度数据预取作为默认行为。
- 不在本次直接修改生产页面；先完成视觉门禁。

## Decisions

### 1. 规范路由保持在 stock detail

规范路由：

```text
/home/market/stock/:symbol?mode=quick|research
```

- 缺省 `mode=quick`。
- `mode=research` 表示共享股票头下的深度研究。
- 用户切换模式时使用 router navigation 更新 query，保留 `tf`、`from`、`list`、
  `listTab`、`listPage` 和 `listQ` 中适用的参数。

替代方案是保留 `/home/market/analysis/:symbol` 作为规范详情：与行情列表的默认入口
冲突，而且会让“行情中心”入口最终落到“个股分析”路由。因此不采用。

### 2. 页面拆成共享壳和两个按需内容区

`stock/$symbol.tsx` 负责：

- 解析 symbol、mode 和来源参数；
- 股票身份头；
- 模式切换；
- 页面导航和返回上下文；
- 快速内容与深度内容的隔离边界。

新增/提取：

```text
apps/web/src/routes/home/market/stock/-private/
├── StockWorkspaceHeader.tsx
└── StockResearchPanel.tsx
```

- 快速视图保留在 stock detail 路由内，避免迁移已经验证过的 klinecharts 生命周期；
  路由负责 K 线、资金和信号摘要的组合。
- `StockResearchPanel` 动态导入现有研究详情内容，并将原页面级股票头降级为内容区头。
- 共享壳只渲染一次股票名称、代码、报价、状态、收藏和主要操作。

替代方案是两个组件各自保留完整页面：会造成重复头部和重复数据请求，不采用。

### 3. 深度研究按首次进入挂载并延迟请求

- `StockResearchPanel` 使用 `React.lazy`/动态 import，仅在 `mode=research` 时挂载。
- `useStockAnalysisQuery` 保持原有 query key 和 staleTime，但只在研究组件内调用。
- 默认快速模式不得触发整页 `stock-analysis` 聚合请求。
- 从研究切回快速时，已取得的 React Query 缓存保留，但不主动刷新或继续轮询。
- 从快速再次进入研究时，若缓存仍有效则直接使用缓存。

替代方案是在父层同时请求两套数据：会增加首屏负载和失败耦合，不采用。

### 4. 快速模式继续做主视觉，深度模式复用现有研究内容

- `quick` 复用当前快速详情及其 K 线、资金、技术标签、快捷操作。
- `research` 复用现有个股分析模块、数据质量和部分失败逻辑。
- 共享顶部的报价以快速行情查询为准；深度响应中的 quote 只用于研究模块质量校验，
  不重复创建第二个价格头。
- 如果快速报价不可用但研究数据可用，研究内容仍显示自己的数据日期与质量；共享头
  明确显示行情缺失，不使用研究结果伪造实时报价。

### 5. 使用 URL 模式切换而不是内存状态

- 快速与深度切换更新 `mode` query。
- 用户主动切换使用 push navigation，浏览器后退可回到前一模式。
- 旧 `/home/market/analysis/:symbol` 使用 replace redirect 到
  `/home/market/stock/:symbol?mode=research`，避免历史栈多一层兼容页。
- `/home/market/analysis/compare` 保持独立，不参与 redirect。

替代方案是只用组件 state：刷新、分享和后退无法恢复当前模式，不采用。

### 6. 个股分析 Landing 与对比页保留

- `/home/market/analysis` 继续承载搜索、自选和最近分析。
- Landing 中“打开分析”链接改为统一路由的 `mode=research`。
- Compare 中单股链接改为统一路由的 `mode=research`。
- 侧栏“个股分析”仍然指向 Landing；规范详情页的导航归属仍为行情中心下的个股。

替代方案是删除“个股分析”导航：会移除现有的股票搜索和对比入口，不采用。

### 7. 模式切换必须支持无跳转恢复

- 模式控件使用可访问的 segmented control，并同步 URL。
- 切换时保留当前滚动位置中的共享头；深度内容加载失败不清空股票头。
- 浏览器的 back/forward 触发 search 变化后，路由重新选择对应模式。
- K 线周期变化继续使用现有 `tf` 参数，两模式共享同一周期选择。

### 8. 未来一周只显示一条中位路径

- 快速模式将未来一周直接并入 K 线数据画布，历史与预测共用同一价格纵轴。
- 图表只绘制 P50 中位路径；P10/P90 仅作为概率区间阴影。
- 不绘制偏强、中枢、偏弱或其他多条情景线。
- 该选择降低视觉噪声，并避免用户把多条样本路径理解成并列目标价。
- 快速模式通过只读端点 `GET /api/v1/stock-analysis/:symbol/forecast` 读取既有
  `historical-bootstrap-v1` 结果；该端点不加载新闻、研报、财务、事件或完整技术聚合。
- 日节点由今收向 5D 中位终点做几何插值，只用于同轴展示；界面明确说明这是终点插值路径，
  不是逐日模型预测或目标价。

### 9. 技术信号按矩阵打开右侧抽屉

- 每个矩阵卡整体是按钮，点击后保持当前工作台位置不变。
- 折叠卡固定显示信号目录顺序的前 3 项，并明确标注“目录预览 · 前 3 项”；不按实时
  状态、权重或模型推荐排序，避免把预览误解成最重要的三条。
- 右侧抽屉呈现该矩阵全部信号、每项状态与读数、矩阵摘要、数据源、截止时间和规则版本。
- 抽屉中的每条信号可内联展开组成证据、数据边界、版本时间、规则参数和确认/失效条件；
  同一时间只展开一项，保持 16/11/10/7 项列表的可扫描性。
- 桌面抽屉使用 560px 宽度承载展开内容；移动端使用可用全宽并转为单列证据布局。
- 移动端抽屉使用可用全宽；关闭后焦点返回触发矩阵，避免用户丢失当前位置。

## Risks / Trade-offs

- **首屏查询变多**：共享头可能同时需要 quote 和研究数据 → quick 模式仅执行轻量请求；
  research 数据由子组件懒加载。
- **重复股票头**：现有深度组件自带身份头 → 提取旧头为共享组件，研究内容不得再次渲染
  页面级头。
- **旧链接失效**：书签仍指向 analysis detail → 添加参数保持和 replace redirect。
- **导航归属不清**：模式 research 可能让用户期待“个股分析”高亮 → 规范详情明确归属
  行情中心下的个股；Landing 仍作为独立搜索工具。
- **模式状态丢失**：只保存组件 state 会导致刷新回到快速 → mode 始终写入 URL。
- **深度组件过重**：完整研究一次性挂载可能阻塞切换 → 动态 import + 模块级加载状态；
  不在视觉方案确认前拆细研究模块。
- **部分失败混淆**：研究请求失败会被误判为整页失败 → 研究区域使用独立错误边界，
  共享头和快速模式保持可用。

## Visual Design

状态：`confirmed by user on 2026-11-27`。

- 探索稿：
  [unified-stock-workspace-v2.html](../../../docs/design/prototypes/explorations/unified-stock-workspace-v2.html)
- 截图索引与评审记录：
  [README.md](../../../docs/design/prototypes/explorations/screenshots/unified-stock-workspace-v2/README.md)
- 上一版探索稿保留在
  [unified-stock-workspace-v1.html](../../../docs/design/prototypes/explorations/unified-stock-workspace-v1.html)
  供追溯。
- 真实浏览器覆盖 `1440×900`、`390×844`、浅色、深色、快速、研究、加载、失败、
  部分成功、行情与研究交叉缺失、模式切换和键盘焦点。
- 全状态与完整研究区的自动检查均为零控制台错误、零图片失败、零页面级横向溢出、
  零 lint。
- 最终独立视觉与 UX closure review：**9/10，无剩余阻断项**。
- 用户已明确确认该视觉方向；生产实现以 V2 探索稿与截图证据为视觉基准。

选定的视觉方向：

- 股票身份头和模式切换只出现一次；
- 快速模式采用“主 K 线 + 连续研判栏”；
- 未来一周直接并入 K 线画布，只绘制一条 P50 中位路径，概率区间用阴影表达；
- 技术信号矩阵点击后打开右侧完整分组抽屉，列表项可继续内联展开，不跳转页面；
- 研究模式保留“行情底稿”，研究请求独立加载或失败；
- 正常状态用行情、资金和证据摘要表达，系统解释只用于加载、失败与缺失状态；
- 品牌蓝承载交互与研究结构，黄色承载部分或缺失状态，红绿只表达价格方向。

技术方案确认后必须制作独立探索稿，覆盖：

- 快速模式与研究模式在同一股票头下的关系；
- 模式切换、持久选中态和返回路径；
- 研究内容首次加载、部分成功、错误与重试；
- 行情或 K 线不可用但研究内容可用的交叉状态；
- `1440×900`、`390×844`、浅色/深色、矩阵抽屉及单项展开、键盘焦点和 reduced motion。

探索稿必须保存在 `docs/design/prototypes/explorations/`，不得覆盖当前快速详情或个股
分析基准稿。视觉确认前，`tasks.md` 只能包含视觉设计门禁。

## Migration Plan

1. 新增统一的 `stock-workspace` 路由壳，保留现有快速详情组件作为 `quick` 子视图。
2. 将现有 `StockAnalysisDetail` 拆成共享头可消费的研究内容视图，并添加动态挂载边界。
3. 在 stock detail 路由增加 `mode` 搜索参数、模式控件和状态恢复。
4. 将旧 analysis detail 路由改为 replace redirect；保持 compare 静态路由优先。
5. 更新 Landing、看板、选股、对比和所有内部单股链接到规范路由。
6. 更新导航、面包屑、页面标题和返回目标测试。
7. 视觉门禁通过后再实施页面，并完成桌面/移动、主题、键盘和失败隔离回归。
8. 新增轻型预测读取端点，复用既有预测计算，不写入新的预测表或数据库结构。

回滚：

- 将 stock detail 的 `mode=research` 入口关闭，恢复旧“深度分析”按钮和旧 detail 路由。
- 保留统一路由与兼容 redirect，但默认只显示 quick；
- 不修改现有聚合 API 契约、数据库结构、预测计算和已确认研究模块；回滚时可移除新增的
  轻量预测读取端点，快速 K 线显示“预测待接入”。

## Open Questions

无。默认快速模式、统一路由、深度按需加载、Landing 与对比页保留、旧链接兼容均已
确认。

## Review Result

- 状态：`not-required`
- 原因：本变更按 L1 规划，不涉及认证、权限、数据口径、PIT、迁移或跨服务契约；
  L1 由作者自检并在实现后运行前端测试与完整验证。
