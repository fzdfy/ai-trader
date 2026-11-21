# Proposal

## Why

当前工作台同时存在全局顶栏、业务侧栏和多处 AI 入口，重复占用垂直空间，也让导航层级分散。按原型稿收敛为无全局顶栏、首页重排和单一悬浮助手入口，可为数据页面释放空间并形成一致的工作台外壳。

## What Changes

- 移除应用级全局顶栏，保留原型中的吸顶页面级导航条和页面标题区。
- 页面级导航条显示 `Apollo Quant / 父页面 / 当前页面`、真实同步状态和站内页面搜索；父级通过可点击面包屑返回，不再保留独立返回按钮。
- 将品牌、业务导航、数据状态、主题和账户入口收敛到 `/home/*` 的工作台侧栏，并支持桌面收起为图标栏、持久化收起状态。
- 按原型稿重排 `/home` 首页，只使用现有真实数据，删除重复的 AI 按钮和独立 AI 卡片。
- 将 `/home` 升级为每日决策看板：数据状态、市场广度、资金主线、涨停温度、每日选股、今日工作流、资讯和最近复盘均由聚合接口读取真实数据，并显示各自快照日期。
- 从侧栏移除“信号”菜单组和未在原型中出现的知识库入口，保留对应页面路由与深链接。
- 将侧栏重组为“工作空间 / 市场情报 / 量化研究 / 流程自动化”四组，并按确认原型展示 12 个业务入口。
- 新增 `/home/tasks`、`/home/market`、`/home/research` 开发中页面；未实现入口统一展示开发状态。
- 将系统能力收敛为侧栏底部的三个 `33×33px` 图标按钮，仅保留同步中心、数据中心和主题设置；展开时横排，收起时纵排。
- 将今日复盘入口命名为“每日复盘”，保留历史复盘页面内入口。
- 增加右下角悬浮助手按钮；宽屏打开右侧抽屉并为主内容让出 392px，窄屏覆盖主内容。
- 助手抽屉支持新建会话、历史会话、当前会话恢复和进入完整会话页；路由变化时关闭抽屉并保留会话。
- 助手抽屉只显示当前页面名称和同步时间，不向 Agent 或 API 注入页面数据上下文。
- 所有登录后业务页面复用页面级导航条；移动端左侧控制按页面切换为工作台菜单、会话历史或返回工作台。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `preline-workbench-ui`: 工作台从带全局顶栏和右侧常驻助手的三列布局，调整为无全局顶栏、首页重排、侧栏承载全局操作和悬浮助手抽屉的布局。

## Impact

- 前端壳层：`apps/web/src/routes/__root.tsx`、`apps/web/src/routes/home/route.tsx`
- 首页：`apps/web/src/routes/home/index.tsx`
- 助手与资讯页面：`apps/web/src/routes/ai-chat/*`、`apps/web/src/routes/news.tsx`
- 导航与工作流占位页：`apps/web/src/lib/workbench-navigation.ts`、`apps/web/src/routes/home/workflows.tsx`
- 主题与样式：`apps/web/src/styles/themes/preline/ai-trader.css`
- 文档与规格：`GLOSSARY.md`、`docs/adr/`、`docs/design/prototypes/README.md`、`openspec/changes/refine-headerless-workbench-assistant/`
- 不修改后端 API、Agent 上下文协议、数据库或数据同步逻辑。
