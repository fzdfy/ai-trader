# 行情中心个股模块分页与白色数据画布设计

状态：技术评审已通过  
日期：2026-11-25  
关联变更：`openspec/changes/optimize-market-center-stocks`

## 1. Intent

把行情中心个股模块从“加载更多”改为可定位、可恢复的稳定分页，并让快速行情详情中的 K 线与资金结构形成单一、连续、双主题下仍保持白色的数据阅读区域。由于本次重写自选分页接口，同时把全部 watchlist 读写从可伪造的客户端身份头迁移到 Better Auth 服务端 Session。

目标不是重做个股模块，也不是修改 K 线数据能力。变更只覆盖 Stock List 的浏览状态与 Quick Quote Detail 的内容组织。

## 2. Goals

- 全市场、搜索结果和自选均按股票代码升序稳定分页，每页 10 只。
- `tab`、`page`、`q` 由 URL 驱动，刷新、前进和后退可以恢复列表。
- 搜索同时作用于全市场和自选；切换 Tab 保留搜索词并回到第 1 页。
- 全部 watchlist 读写由服务端 Session 识别当前用户，前端不再发送 `X-User-Id`。
- Quick Quote Detail 的顺序为股票名称/代码/价格、K 线、资金结构，不重复展示成交额、主力净流入、PE。
- K 线主图、成交量、MACD、坐标轴、图表外围与资金结构处于同一块固定白色数据画布。
- 白色画布在浅色和深色主题下都保持白底；页面导航、周期切换和操作按钮继续遵循当前主题。

## 3. Non-goals

- 不修改个股分析 `/home/market/analysis/$symbol`。
- 不修改 K 线 Provider、复权、PIT、周期、指标计算或图表数据契约。
- 不新增涨幅、市值、资金流排序或额外筛选。
- 不改变资金结构字段、主力净流入口径或自选数据表。
- 不把行情中心全局主题改成强制浅色。
- 不在列表内重新加入快速详情面板。

## 4. Anti-goals

- 分页后仍允许“加载更多”，导致两套浏览心智并存。
- 用未排序的数据库默认顺序做分页，造成跨页重复或遗漏。
- 继续信任客户端 `X-User-Id`，把用户自选暴露给可伪造身份头。
- 仅把页面外层设成白色，但图表坐标轴、副图、十字线或资金卡片仍使用深色主题表面。
- 用整页浅色覆盖导航和操作按钮，破坏全局主题一致性。
- 为了白色画布复制一套 K 线数据加载或图表实现。

## 5. Current State

- `GET /api/v1/instruments` 已支持 `page/limit/q`，但数据查询没有稳定排序。
- 个股页 `useInstrumentsQuery` 使用 `useInfiniteQuery`，在底部提供“加载更多”。
- `GET /api/v1/watchlist/instruments` 当前无分页，返回数组；个股分析搜索入口也复用该 hook。
- 当前 watchlist 的读取、添加和删除全部从 `X-User-Id` 读取身份，违反后端 Session 安全标准。
- 快速行情详情使用全局 `bg-app-panel`，资金结构位于 K 线上方。
- `klinecharts` 的 `Styles` 支持设置 `grid`、`candle.tooltip`、`indicator.tooltip`、`xAxis`、`yAxis`、`crosshair`、`separator` 和 `overlay`，可在不重写图表框架的情况下配置固定白色数据画布。
- 当前 `chartGrid()`、`chartAxisText()` 等函数从根主题读取颜色，深色模式下不能直接用于白色画布。

## 6. Approaches

### Approach A：统一服务端分页 + 局部白色图表主题

- 全市场分页继续使用现有接口，并增加 `symbol ASC`。
- 自选接口在传入分页参数时返回分页结构，不传分页参数时保留原数组响应。
- 全部 watchlist 读写改用 Better Auth 服务端 Session，前端移除身份头。
- 个股页新增独立分页 hooks，不改变分析页面现有的无限查询 hook。
- Quick Quote Detail 用专用白色 token、固定 `klinecharts` 样式和资金结构变体。

优点：分页口径一致、兼容现有分析页面、图表改动范围清晰。  
代价：自选接口需要兼容两种响应形态，并补充对应测试。

### Approach B：全市场服务端分页 + 自选前端分页

- 全市场使用服务端分页。
- 自选仍一次返回全部，由前端切片。

优点：自选后端改动较少。  
代价：存在两套分页逻辑；自选数量增长后退化；页码、范围和失败状态难以保持一致。

### Approach C：整页强制浅色 + 统一服务端分页

- 分页采用 Approach A。
- 快速详情整页强制浅色主题。

优点：图表样式最简单。  
代价：深色模式下导航和操作控件突然变白，违背已确认的数据画布边界。

## 7. Selected Approach

采用 **Approach A**。

选择理由：

- 全市场与自选共享同一分页语义。
- 保留 `/watchlist/instruments` 的旧响应，不破坏个股分析入口。
- 从服务端 Session 解析 owner，消除可伪造用户身份的阻断风险。
- 只替换行情中心个股页的数据 hook 和 UI 状态。
- 白色画布成为局部数据组件，而不是全局主题覆盖。

本方案没有新增难以回滚的数据或架构决策，因此不新增 ADR。

## 8. API Design

### 8.1 Full-market instruments

继续使用：

```text
GET /api/v1/instruments?page=1&limit=20&q=比亚迪
```

行为：

- `page` 归一化为大于等于 1 的整数。
- `limit` 归一化到 1–200；个股页固定请求 20。
- `page` 或 `limit` 非法时返回 `400`，不得把 `NaN` 或非正数传给数据库。
- `q` 继续匹配 `code`、`symbol` 或 `name`。
- 数据查询和排序必须先 `orderBy(instrument.symbol ASC)`，再 `limit/offset`。
- 响应继续使用现有 `PaginatedResponse`。

### 8.2 Watchlist instruments

继续使用同一路径：

```text
GET /api/v1/watchlist/instruments
GET /api/v1/watchlist/instruments?page=1&limit=20&q=比亚迪
```

兼容与认证契约：

- 未提供 `page` 和 `limit`：保持现有 `{ success, data: Instrument[] }` 数组响应，供个股分析搜索等既有调用方使用。
- 同时提供 `page` 和 `limit`：返回 `{ success, data, total, page, limit, totalPages }`。
- 只提供其中一个参数、参数非法或两者同时非法：返回 `400`，不得静默退回旧数组响应。
- `q` 在两种模式下都只匹配关联的股票代码或名称。
- 分页和旧数组模式都按 `instrument.symbol ASC`。
- `total` 统计当前用户、当前 `q` 条件下实际关联到 `instrument` 的行数。

条件分支必须由专用参数判断函数和测试固定，禁止依赖“请求里碰巧带了字符串”。

### 8.3 Watchlist authentication

全部 watchlist 接口必须使用：

```ts
const session = await auth.api.getSession({ headers: c.req.raw.headers });
```

- 没有有效 Session：返回 `401`。
- 当前用户 ID 只来自 Session，忽略 `X-User-Id`。
- `GET /watchlist`、`GET /watchlist/instruments`、`POST /watchlist`、`DELETE /watchlist/:symbol` 全部使用同一身份来源。
- 所有读取、添加和删除条件都包含服务端 Session 用户 ID。
- 前端 watchlist hooks 不再发送身份头。

## 9. Web Data Flow

### 9.1 URL state

个股页 search schema：

```ts
{
  tab: "stock" | "watchlist";
  page: number; // >= 1
  q: string;
}
```

默认值：

```ts
{ tab: "stock", page: 1, q: "" }
```

行为：

- 页码按钮使用普通导航写入历史，确保浏览器前进/后退可恢复。
- 提交新搜索：写入 trim 后的 `q`，`page=1`。
- 切换 Tab：保留当前 `q`，`page=1`。
- URL 变成无效页码时，在收到结果后用 replace 导航到最大有效页；`total=0` 时回到第 1 页。
- 搜索框保留草稿输入；只有提交后才改变 URL `q`。URL 的 `q` 因后退/外部链接变化时，草稿输入同步更新。
- 从个股列表进入详情时携带 `from=market-stock` 和来源 `tab/page/q`；详情返回动作使用该上下文恢复列表，不依赖浏览器恰好保留上一条历史。

### 9.2 Queries

新增独立 hooks：

- `useInstrumentPageQuery(q, page, limit)`：调用全市场分页接口，返回单页响应。
- `useWatchlistInstrumentPageQuery(q, page, limit)`：调用自选分页模式。

保持不动：

- 分析页现有的 `useInstrumentsQuery` 无限查询。
- 分析页现有的 `useWatchlistInstrumentsQuery` 旧数组查询，除非只增加 query 缓存失效。

个股页只请求当前页，`useLatestQuotes` 也只接收当前页最多 20 个 symbol。

所有 watchlist 查询 key 必须绑定 Session 用户：

```ts
["watchlist", userId]
["watchlistInstruments", userId]
["watchlistInstruments", userId, "page", q, page, limit]
```

- userId 未确定前禁用查询。
- 用户切换或退出时移除上一用户的 watchlist 缓存。
- 新增或删除自选后按 `["watchlist", userId]` 与 `["watchlistInstruments", userId]` 前缀统一失效。

### 9.3 Pagination UI

复用 `@preline-ui/Pagination` 和 `paginationTokens()`：

- 当前页、范围、总数和总页数来自分页响应。
- 全市场和自选共用同一分页组件。
- `total=0` 时只显示空状态，不渲染不存在的页码。
- 页码或范围变化后，图表外区域保持稳定，不保留“加载更多”。

## 10. Quick Quote Detail Layout

顺序固定：

1. 页面导航、返回、周期切换和深度分析入口。
2. 股票名称、价格、涨跌幅、来源和快照时间。
3. 白色数据画布。
4. 画布内先 K 线，后资金结构。

顶部导航和操作区在白色数据画布之外，继续使用全局主题。

## 11. White Data Canvas

### 11.1 DOM boundary

新增单一 `quote-data-canvas` 容器，包含：

- K 线容器；
- K 线主图；
- 成交量副图；
- MACD 副图；
- 坐标轴和图表网格；
- 资金结构区块及其加载、空、错误状态。

股票行情摘要不强制进入白色画布；其视觉关系在视觉设计阶段确认。

### 11.2 Semantic tokens

在主题 CSS 中新增固定白色数据画布的语义 token，不在 React 组件散落 raw hex：

- canvas background；
- canvas surface；
- ink / muted text；
- border / grid / axis；
- crosshair / tooltip background / tooltip border；
- white-canvas 专用的上涨红、下跌绿和持平灰；
- 白色画布内使用的均线颜色。

这些 token 在浅色和深色主题下保持相同值，`color-scheme` 在画布范围内设为 light。

### 11.3 klinecharts styles

初始化图表时，从白色画布 token 构造完整样式：

- `grid.horizontal/vertical`
- `candle.tooltip`
- `indicator.tooltip`
- `xAxis/yAxis` 的轴线和刻度文字
- `crosshair` 的线、文字和标签
- `separator`
- 与 K 线有关的 `overlay` 默认样式

价格柱、成交量柱和 MACD 柱继续使用 A 股红涨绿跌，但读取白色画布专用颜色，避免深色主题的浅红/浅绿在白底上对比不足。

### 11.4 FundStructure compatibility

`FundStructure` 新增仅用于 Quick Quote Detail 的白色画布呈现方式：

- 默认调用保持现状，不影响板块详情。
- 白色画布模式使用白色画布语义 token 表达卡片、文字、错误和空状态。
- 组件数据、字段顺序和资金口径不变。

### 11.5 K-line loading state

K 线数据加载器必须维护显式状态：

- `loading`：开始请求或切换标的/周期后、结果返回前。
- `ready`：取得非空 K 线。
- `empty`：请求成功但返回空数组。
- `error`：请求抛出异常。

白色画布保留统一背景，并在图表区域展示对应状态；不得再把请求异常静默折叠为空数组。重试时先移除/失效失败缓存，再调用图表 `resetData()` 重新触发数据加载。

## 12. States and Failure Modes

- 全市场、空搜索、空自选：显示真实空状态；不显示无效页码。
- 分页请求失败：保留当前筛选和页码，显示可重试错误。
- 自选未登录或无用户：继续显示现有不可用/空状态，不请求伪造数据。
- Session 用户变化：旧用户缓存不得渲染；新用户查询在 Session 就绪后启用。
- 页码越界：收到结果后跳到最后有效页；防止重复 replace。
- 搜索词快速变化：只有提交的 `q` 进入查询 key，避免每次按键请求。
- K 线加载中、空和失败必须分别通过显式状态展示，不得把异常伪装成空数据。
- 资金结构失败或缺失：白色画布和 K 线保持，资金结构区域显示真实失败或空状态。

## 13. Compatibility

- `/home/market/stock/$symbol` 深链接和返回路径不变。
- `/home/market/analysis/$symbol` 不受白色画布影响。
- 旧自选数组响应继续可用，避免破坏个股分析和比较入口。
- watchlist 前端请求不再发送 `X-User-Id`，但保留同源 Cookie Session 行为。
- K 线接口、query key、缓存和数据契约不变。
- 无数据库迁移。
- 个股页 hook/UI 和 Quick Quote Detail 样式可以独立回滚；Session 认证修复不得回滚成客户端身份头。

## 14. Accessibility and Responsive Behavior

- 分页使用导航语义、当前页 `aria-current`、明确上一页/下一页标签和可见焦点。
- 移动端分页允许换行，不得横向溢出。
- 白色画布中的文字、网格、坐标轴和资金状态必须达到可读对比度。
- K 线继续支持现有周期切换和键盘行为。
- reduced-motion 不因本变更新增持续动画。

## 15. Testing Strategy

### Server

- 全市场分页按 `symbol` 升序。
- 全市场 `page/limit` 非法值返回 `400`。
- 自选无分页参数保持旧数组响应。
- 自选只提供 `page` 或只提供 `limit` 时返回 `400`。
- 自选分页模式返回正确 `total/page/limit/totalPages`。
- watchlist 读取、添加和删除均从 Session 解析用户；伪造 `X-User-Id` 无效。
- 未登录 watchlist 读写返回 `401`，不泄漏也不修改任何用户数据。
- 同一浏览器切换账号或退出后，不得显示上一用户缓存的自选列表。
- 自选分页和搜索不泄漏其他用户数据。
- 搜索对全市场和自选均匹配 code/symbol/name。

### Web unit tests

- search schema 默认值与非法页码归一化。
- 页码范围、分页 tokens 和空结果状态。
- 搜索提交、Tab 切换、URL 恢复的纯状态函数。
- 详情返回列表时恢复 `tab/page/q`。
- 新增或删除自选后，旧数组与分页自选查询前缀都失效。
- watchlist query key 包含 userId，Session 未就绪时不发起请求。
- 白色画布样式 token 构造结果，包含 grid、axis、tooltip、crosshair 和红绿柱。
- K 线 loading/ready/empty/error 状态不会互相误报。

### Integration and manual

- 全市场第 1/2/末页、自选第 1/2 页和搜索后分页。
- 刷新、后退、前进恢复 `tab/page/q`。
- 越界页纠正到最后有效页。
- Quick Quote Detail 在桌面/移动端、浅色/深色下 K 线和资金结构均在白色画布。
- K 线或资金结构加载、空、失败状态保持白色画布。
- 无明显水平溢出、焦点回归或重复请求。

## 16. Visual Design Gate

技术评审通过后，视觉设计必须从已确认的行情中心原型复制到 `docs/design/prototypes/explorations/`，至少覆盖：

- 全市场分页：第 1 页、中间页、末页、空结果、错误；
- 自选分页：有数据、空、错误；
- Quick Quote Detail：桌面/移动端、浅色/深色；
- K 线与资金结构加载、空、错误；
- 分页键盘焦点和移动端换行。

用户确认视觉稿前，不创建生产实现任务。

## 17. What Is Left to the Builder

- 选择具体测试文件与最小 fixture。
- 选择新 hooks 的命名位置，但不得改变既有 hook 语义。
- 选择白色画布 token 的具体命名，但必须遵守语义 token 约束。
- 根据视觉确认结果调整间距、圆角、边框和加载骨架，不改变内容顺序和功能边界。
