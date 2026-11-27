# Tasks

## 0. Visual Design Gate

- [x] 0.1 基于更新后的 Atlas 最新快速行情详情和个股分析生产对齐稿，创建独立探索
  `docs/design/prototypes/explorations/unified-stock-workspace-v2.html`；验证稿包含共享
  股票身份头、`快速看盘 / 深度研究` 模式切换、快速 K 线与资金的连续关系、研究模式的
  首屏加载和按需内容边界，未来一周直接并入 K 线且只显示一条 P50 中位路径，技术信号
  按矩阵打开右侧完整分组抽屉且列表项可继续展开，且不覆盖历史原型。
- [x] 0.2 使用真实浏览器截取快速模式、研究模式、研究加载中、研究失败、研究部分成功、
  行情与研究交叉缺失、深色和移动端状态；覆盖 `1440×900`、`390×844`、浅色/深色、
  模式切换、键盘焦点、K 线内单一路径预测、矩阵抽屉/单项展开和 reduced motion；验证无控制台
  错误、图片失败和页面级横向溢出。
- [x] 0.3 按 `oil-ui` 和 `ui-design` 完成真实截图评审，检查股票身份是否只出现一次、
  快速与深度模式的主次是否清楚、研究失败是否保留快速内容、移动端阅读顺序和返回路径
  是否明确、未来一周是否只绘制一条路径、技术信号是否按矩阵打开全部项且单项可展开；验证评审问题记录、
  修复并复审。
- [x] 0.4 向用户提交探索稿、截图索引和待确认视觉问题；只有用户明确确认视觉方向后，
  才能在 `tasks.md` 添加路由合并、研究内容懒加载、旧 URL 兼容和测试任务；验证
  `design.md#Visual Design` 记录确认后的原型和截图链接。

## 1. Route and state contract

- [x] 1.1 先写失败测试，覆盖 `mode` 缺省为 `quick`、非法值回退、规范工作台 URL 构造、
  切换模式保留 `tf/from/list/listTab/listPage/listQ`，以及旧 analysis detail 重定向到
  `mode=research`；运行
  `node --test --experimental-strip-types apps/web/src/lib/stock-analysis.test.ts`，
  确认新断言因契约缺失而失败。
- [x] 1.2 实现统一的 stock workspace search/path helper 和旧 URL 兼容目标；将导航、
  返回目标和面包屑归属固定到 `/home/market/stock/:symbol`，并运行同一测试至通过。

## 2. Shared workspace shell

- [x] 2.1 先写失败测试，覆盖快速与研究共享同一股票头、模式切换更新 URL、浏览器
  back/forward 恢复模式，以及研究失败不清理快速行情；运行相关 web 测试并确认 RED。
- [x] 2.2 提取 `StockWorkspaceHeader` 与模式控件，统一股票名称、代码、报价、数据时间、
  模式和返回链路；移除研究内容中的第二个页面级股票头。
- [x] 2.3 在统一路由内保留快速视图，保持 klinecharts 生命周期、K 线周期、相邻标的切换、
  资金结构、技术摘要和选股来源上下文行为。

## 3. Lazy research boundary

- [x] 3.1 先写失败测试，证明默认 `quick` 不挂载 `StockAnalysisDetail` 且研究模式按需
  挂载；确认测试在直接静态挂载时失败。
- [x] 3.2 使用动态 import 实现 `StockResearchPanel`，仅在 `mode=research` 挂载，
  让 `useStockAnalysisQuery` 保持在研究组件内；研究加载、错误和重试只替换研究区域。
- [x] 3.3 保留研究部分成功模块、内容刷新、研报索引、自选/对比/工作任务的既有行为。

## 4. Forecast integration

- [x] 4.1 先写失败测试，覆盖五日预测只产生一条 P50 序列、P10/P90 只形成区间，以及
  缺失数据不生成虚构路径；运行预测纯函数测试确认 RED。
- [x] 4.2 接入可在快速模式独立读取的预测数据；若预测 API 尚未就绪，明确显示“待接入”，
  不请求完整 `stock-analysis` 聚合数据，不伪造数值。
- [x] 4.3 把未来一周叠加到快速 K 线同一价格画布，并显示“非目标价”和预测数据边界。

## 5. Signal matrix drawer

- [x] 5.1 先写失败测试，覆盖矩阵固定取目录顺序前 3 项、完整抽屉读取该矩阵全部信号、
  单项展开互斥及触发后关闭恢复焦点；运行信号测试确认 RED。
- [x] 5.2 将研究信号区改为可点击矩阵卡，显示“目录预览 · 前 3 项”和“查看全部 N 项”；
  保持 16/11/10/7 的组内稳定顺序。
- [x] 5.3 实现 560px 右侧抽屉、移动端全宽、Escape/关闭按钮、焦点闭环和 full-width
  square-edged hover/expanded 背景；每项内联展示证据、数据边界、版本时间、规则参数、
  确认与失效条件，同一时间仅展开一项。

## 6. Links and compatibility

- [x] 6.1 先写失败测试，覆盖 Landing、对比页、行情详情、看板和选股入口统一指向规范
  stock workspace，并保留研究模式来源参数。
- [x] 6.2 更新所有内部单股入口与 `stockAnalysisPath`；旧
  `/home/market/analysis/:symbol` 用 replace redirect 到
  `/home/market/stock/:symbol?mode=research`，不得影响 Landing 与 compare。

## 7. Verification

- [x] 7.1 运行目标 web 测试、完整 `pnpm --filter @ai-trader/web test`、
  `pnpm check-types`、`pnpm lint` 和生产构建；记录失败与修复结果。
- [x] 7.2 启动 web 和目标 API 依赖，用真实浏览器覆盖桌面/移动、浅色/深色、快速/研究、
  加载/失败/部分成功、矩阵抽屉/单项展开、键盘和 reduced motion；与 V2 关键截图比对。
- [x] 7.3 更新 `verification.md`，写明自动化结果、浏览器证据、未覆盖项和回滚边界；
  提交用户验收，不自动归档。

## Workflow follow-up

- 实施完成后运行前端测试、类型检查、lint 和浏览器回归。
- 用户验收与归档确认必须分开。
- 归档时把最终视觉设计提升为 `initial/` 基准、更新 Atlas 并重新执行浏览器验证。
