# Tasks

## 0. Visual Design Gate

- [x] 0.1 交付三模块行情中心探索稿：板块第一层展示当前排行和热力图，第二层直接展示轮动和异动；板块与个股详情展示资金结构；浏览器检查无控制台错误、横向溢出、图片加载失败和可读性提示。
- [x] 0.2 保存桌面 `1440×900`、移动端 `390×844`、浅色和深色截图，覆盖三模块、板块同屏内容、详情资金结构和交互路径。
- [x] 0.3 用户确认视觉方案。

## 1. Rotation Index Provider

- [x] 1.1 在 `apps/quant/data/index_rotation.py` 实现中证 930955 与腾讯 399673 日线解析/取数，并用 `cd apps/quant && uv run python -m unittest tests.test_index_rotation -v` 验证 RED→GREEN。

## 2. Rotation Storage

- [x] 2.1 新增 `rotation_index_daily_bar` Drizzle schema、固定 `399673.SZ` / `930955.CSI` 目录、幂等写入和读取，并验证重复同键只保留一行。
- [x] 2.2 新增 quant 日线端点和 sync-worker 日线任务，验证部分标的失败不覆盖另一标的已有数据。

## 3. Market Center API

- [x] 3.1 实现 `computeMarketRotation`，覆盖 5D/20D/60D 相对收益、排名变化、阶段和数据不足状态，并通过纯函数测试。
- [x] 3.2 新增 `GET /api/v1/market-center/overview` 和 `GET /api/v1/market-center/rotation`，通过 API 测试验证 scope/window 校验、部分成功与全部失败。

## 4. Web Contract and Navigation

- [x] 4.1 新增行情中心类型、TanStack Query hooks 和功能开关，验证 aborted request、缓存 key 和错误状态。
- [x] 4.2 更新 `workbench-navigation`，验证三模块标题、板块详情与个股详情面包屑。

## 5. Overview UI

- [x] 5.1 实现 `/home/market` 三模块总览，包含等高的主要指数与 ETF、成长/防守、资产相对强弱和市场温度区域；验证桌面/移动端、浅色/深色和部分失败。

## 6. Boards UI

- [x] 6.1 实现行业/概念板块页：第一层当前排行与热力图，第二层轮动与异动，保留唯一行业/概念切换；验证无二级模式 Tab。
- [x] 6.2 实现 `/home/market/boards/$code`，展示轮动证据、资金结构、异动和成分股；验证点击列表行进入详情且无内嵌详情卡。

## 7. Stocks UI

- [x] 7.1 将个股列表改为全宽行情表并点击进入现有 `/home/market/stock/$symbol`；验证没有右侧详情面板。
- [x] 7.2 在现有 `klinecharts` 个股详情中加入资金结构，保留原有周期切换和增量图表更新；验证数据缺失和单位口径。

## 8. Verification

- [x] 8.1 运行 quant unittest、server/web tests、`pnpm check-types`、`pnpm lint` 和 `pnpm build`，记录全部结果。
- [x] 8.2 在生产页面完成桌面/移动端、浅色/深色、加载/空/部分成功和键盘路径截图；错误态由确认探索稿覆盖，并写入 `verification.md`。
- [x] 8.3 完成代码自审并修复所有 Critical/Important 问题，记录剩余 minor 与用户验收项。

## 9. Main Index Refinement Visual Gate

- [x] 9.1 创建 `docs/design/prototypes/explorations/quant-workbench-market-center-main-indices-v1.html`：上证指数单独全宽一行，六项按固定顺序展示，包含角色标签、行情/相对大盘、5/20/60 日窗口、逐项来源日期、缺失和样本不足状态，并保留独立大类资产轮动区域。
- [x] 9.2 保存桌面 `1440×900`、移动端 `390×844`、浅色和深色截图到 `docs/design/prototypes/explorations/screenshots/market-center-main-indices-v1/`，覆盖成功、加载、空、错误、部分成功、陈旧和键盘焦点。
- [x] 9.3 使用浏览器检查控制台错误、横向溢出、失效图片、可读性、焦点和 reduced-motion，并保存 `report.json`。
- [x] 9.4 用户确认主要指数改版视觉方案后，才允许新增生产实现任务。

## 10. Main Index Provider

- [x] 10.1 在 `apps/quant/data/index_rotation.py` 定义七个主要指数目录，实现腾讯六个指数与中证红利低波100的日线获取，并对部分数据源失败进行隔离；运行 `cd apps/quant && .venv/bin/python -m unittest tests.test_index_rotation -v` 验证。
- [x] 10.2 新增 `/api/v1/data/main-indices/daily` 并测试请求参数与七项数据契约；运行 quant 路由测试验证。

## 11. Main Index Storage and Sync

- [x] 11.1 扩展 `rotation_index_daily_bar` 的符号目录，保留成长/防守二元组并支持七个主要指数；运行 server 存储测试验证去重和未知代码拒绝。
- [x] 11.2 更新 sync-worker 的主要指数日线任务，验证单源失败不覆盖其他指数已有数据；运行定向 node:test。

## 12. Main Index API

- [x] 12.1 实现主要指数行情组装，六项读取实时报价，`930955.CSI` 使用最新官方收盘，并逐项返回来源、日期和质量；运行纯函数/API 测试验证缺失状态。
- [x] 12.2 实现 `scope=main-benchmark`，按共同交易日计算六项相对上证指数的百分点超额收益，少于 4 个有效风格指数时不排名；运行计算与 API 测试验证。
- [x] 12.3 扩展 `/api/v1/market-center/overview` 的 `mainIndices`，保留现有 overview 和独立 `scope=asset` 契约；运行 market-center API 测试。

## 13. Main Index Web

- [x] 13.1 更新 Web 类型、格式化和 TanStack Query hooks，验证固定顺序、角色标签和 `main-benchmark` 查询 key。
- [x] 13.2 实现“主要指数”UI：上证基准行、六个风格指数、行情/相对大盘、5/20/60 日窗口、逐项来源日期、缺失和样本不足状态，并保证两种模式等高；运行 web tests、类型检查和 lint。
- [x] 13.3 将大类资产轮动保留为独立区域，验证它不复用主要指数切换器。

## 14. Main Index Verification

- [x] 14.1 运行 quant、server、web 测试、`pnpm check-types`、`pnpm lint` 和 `pnpm build`，记录全部结果。
- [x] 14.2 部署后将生产页面与确认探索稿对照，补齐桌面/移动端、浅色/深色、缺失/陈旧/样本不足和键盘路径截图，验证两种模式等高。
- [x] 14.3 更新 `verification.md`，完成自审并记录剩余 minor；等待用户单独验收。

## Workflow follow-up

- 用户验收通过并明确要求后再执行 OpenSpec archive。
