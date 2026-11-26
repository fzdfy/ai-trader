# Design

## Context

本设计落实 [proposal.md](./proposal.md) 中的 Stock List 分页和 Quick Quote Detail 白色数据画布。完整技术方案见 [2026-11-25-optimize-market-center-stocks-design.md](../../../docs/superpowers/specs/2026-11-25-optimize-market-center-stocks-design.md)。

当前约束：

- `/api/v1/instruments` 已支持分页，但没有稳定排序。
- `/api/v1/watchlist/instruments` 仍返回全量数组，并被个股分析入口复用。
- `klinecharts` 支持独立配置网格、坐标轴、十字线和浮层样式。
- 数据画布必须固定白色，但不能改变全局浅色/深色主题。
- 后端身份必须来自 Better Auth 服务端 Session，不得信任客户端身份头。

## Goals / Non-Goals

**Goals:**

- 全市场、搜索和自选统一为每页 10 只的服务端分页。
- `tab/page/q` 由 URL 驱动，支持刷新和浏览器历史恢复。
- 搜索同时作用于全市场和自选，切换 Tab 保留搜索词并重置页码。
- Quick Quote Detail 使用统一的白色数据画布，顺序为股票名称/代码/价格、K 线、资金结构；不再重复展示成交额、主力净流入、PE 等指标。
- 保持个股分析与现有 K 线数据契约不变。

**Non-Goals:**

- 不新增排序维度、筛选条件、数据表或迁移。
- 不修改 K 线 Provider、复权、周期、指标计算或资金口径。
- 不修改个股分析页面和全局主题。
- 不重写 `klinecharts` 或资金结构数据链路。

## Decisions

### 1. 统一服务端分页

- 全市场使用现有 `/api/v1/instruments`，增加 `symbol ASC` 和参数校验。
- 自选无 `page/limit` 时保留旧数组响应；同时提供两者时返回分页响应。
- `page/limit` 只提供其中一个或参数非法时返回 `400`，避免调用方误判响应形态。
- 自选搜索在分页和旧数组模式下都匹配 `code/symbol/name`。

替代方案是自选前端切片，但其分页口径与全市场不一致，数据增长后也会退化。

### 2. 个股页使用 URL 作为列表状态源

- Route search 字段为 `tab/page/q`，默认 `stock/1/空字符串`。
- 页码导航写入浏览器历史；越界页使用 replace 修正到有效页。
- 搜索框只维护提交前草稿，提交后才更新 URL `q`。
- 从列表进入 Quick Quote Detail 时携带返回列表的 `tab/page/q` 上下文；返回动作恢复原列表状态。

替代方案是只在组件本地保存页码，但无法满足刷新与前进/后退恢复。

### 3. 自选接口改用服务端 Session

- 所有 watchlist 读写接口从 Better Auth `auth.api.getSession()` 取得当前用户。
- 前端删除 watchlist 请求中的 `X-User-Id`。
- 未登录返回 `401`；所有查询、添加和删除都由服务端校验 owner。
- 所有 watchlist query key 包含 `userId`，Session 未就绪前禁用查询。
- 用户变化或退出时清理上一用户缓存；新增、删除后按当前 `userId` 前缀失效。

这是评审阻断项。当前 `X-User-Id` 模式违反项目 [后端标准](../../../docs/standards/backend.md)。

### 4. Quick Quote Detail 使用局部白色数据画布

- 新增固定白色画布语义 token，覆盖背景、文字、边框、网格、坐标轴、十字线、浮层和红绿行情色。
- `klinecharts` 通过完整白色样式初始化，不依赖根主题的深色网格和坐标轴颜色。
- 资金结构增加 Quick Quote Detail 专用的白色画布呈现方式，其他调用保持现状。
- 顶部导航和操作控件仍在白色画布外，继续跟随全局主题。
- 行情标题、K 线和资金结构合并到一张连续卡片；图表标题下方不展示实现说明文字。
- 卡片标题为单行加粗股票名 + 代码；klinecharts 内置标题与浮层关闭，OHLC/MA 由独立信息条展示在绘图区上方，避免文字压住蜡烛图。
- 最新价与涨跌幅紧跟标题并使用涨红跌绿；十字线变化时信息条显示对应日期的 OHLC、成交量和截至该日的 MA。
- 标题下方以单行文本显示成交额、PE、PE-TTM、PB；PE-TTM 只在详情页通过轻量估值查询读取，列表请求不增加额外查询。

替代方案是整页强制浅色，但会破坏深色主题和已确认的视觉边界。

### 5. 图表状态显式化

- K 线加载器维护 `loading/ready/empty/error` 状态，不再把异常静默折叠为空数组。
- 白色画布内分别展示 K 线加载、失败和无数据状态。
- 资金结构失败或为空时，K 线与行情摘要继续显示。

### 6. 返回路径保留列表上下文

- 个股列表跳转详情时携带 `from=market-stock` 及来源 `tab/page/q`。
- 详细页“返回”优先恢复该列表状态；直接深链接没有来源上下文时回到默认个股列表。

替代方案是只使用浏览器后退，但复制深链接或刷新后不可靠。

### 7. 本机回环 Origin 使用固定端口通配

- Better Auth 和 CORS 在精确 allowlist 之外，固定追加 `http://localhost:*`、`http://127.0.0.1:*`、`http://[::1]:*`。
- 该规则只放行 HTTP 本机回环 Origin，不包含局域网 IP、任意域名或其他协议。
- 公开 HTTPS Origin 仍按现有 allowlist 精确校验，不反射任意请求头。
- 这样 Vite 可通过任意本地端口连接容器内 Better Auth，同时保持公网边界。

## Risks / Trade-offs

- **自选接口双响应形态**：无分页参数返回数组、传完整分页参数返回分页对象。通过严格参数分支和契约测试降低误用风险。
- **安全范围扩大**：本次必须同步修正全部 watchlist 读写的身份来源；只修分页接口会保留可伪造身份漏洞。前端查询缓存也必须按 Session 用户隔离，避免同一浏览器切换账号时显示上一用户数据。
- **全市场排序变化**：`symbol ASC` 也会影响分析搜索的展示顺序。通过回归测试确认只改变顺序，不改变过滤结果。
- **白色画布与深色主题边界**：需用独立 token 和真实截图验证图表、错误态、均线和资金结构在白底上的对比度。
- **图表加载状态**：现有 loader 异常会静默返回空数组；必须补状态通路，避免把请求失败误报为无数据。

## Migration Plan

- 无数据库迁移。
- 先发布兼容的 API 行为与测试，再切换个股页查询 hooks 和分页 UI。
- 保留旧自选数组调用，确认个股分析入口无回归后，再完成详情白色画布。
- 个股页 hook/UI 与 Quick Quote Detail 样式可以独立回滚；Session 认证和用户级缓存隔离不得回滚成客户端身份头或全局共享缓存。

## Visual Design

技术评审通过后，已从确认原型创建独立探索稿：

- [quant-workbench-market-center-stocks-v1.html](../../../docs/design/prototypes/explorations/quant-workbench-market-center-stocks-v1.html)
- [截图与状态证据](../../../docs/design/prototypes/explorations/screenshots/market-center-stocks-v1/README.md)

状态：用户已确认 v2 设计。搜索结果统一为灰蓝整壳、输入框无原生内边框；每页 10 条；详情只保留名称、代码、价格和涨跌，K 线与资金结构位于同一张连续卡片。v2 截图工具报告无控制台错误、横向溢出和图片加载失败。

覆盖范围：

- 个股列表分页的首页、中间页、末页、空、错误；
- 自选分页的有数据、空、错误；
- Quick Quote Detail 的加载、空、错误、成功；
- 桌面与移动端、浅色与深色；
- 分页键盘焦点和白色画布内 K 线、资金结构。

- v2 搜索框、10 条分页和详情层级。

## Open Questions

无。安全范围扩展已由用户确认，用户级查询缓存隔离已补齐并通过复评。

## Review Result

- 日期：2026-11-25
- 评审者：独立技术评审子代理
- 结论：`approved`
- 已闭环阻断项：
  - 全部 watchlist 读写改用 Better Auth 服务端 Session，忽略 `X-User-Id`。
  - watchlist 查询 key 绑定 `userId`，Session 未就绪前禁用，并在用户变化或退出时清理旧缓存。
- 已闭环重要项：
  - 分页参数只提供一半或非法时返回 `400`。
  - Quick Quote Detail 返回路径恢复列表 `tab/page/q`。
  - K 线区分 `loading/ready/empty/error` 并提供重试数据通路。
  - 搜索同时作用于全市场和自选，列表按完整 `symbol` 升序。
- 非阻断实施风险：
  - 返回上下文字段名称可在实施计划中确定。
  - `symbol ASC` 对分析搜索结果顺序的影响需要回归测试。
  - 自选 join 后 `total` 必须按实际关联 `instrument` 的行数统计。
  - 白色画布的 tooltip、均线、十字线、错误色和资金结构对比度必须通过真实截图验收。
