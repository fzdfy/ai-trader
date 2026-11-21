# Tasks

## 0. Visual Design Gate

- [x] 0.1 从现有工作台原型复制创建 `docs/design/prototypes/explorations/quant-workbench-stock-chart-v2.html`，并验证未覆盖 `quant-workbench-assistant.html`。
- [x] 0.2 截取桌面/移动端、浅色/深色及指针/键盘截图，验证无控制台错误、横向溢出、图片加载失败、轴标签裁切或移动端 AI 助手按钮遮挡。
- [x] 0.3 于 2026-11-21 在加入生产实现任务前取得用户对最终视觉稿的明确确认。

## 1. Technical Design Review Gate

- [x] 1.1 对 `docs/superpowers/specs/2026-11-21-stock-analysis-price-chart-design.md` 执行技术评审，覆盖 API 兼容、几何契约、指针/键盘状态、可访问性、响应式、回滚和可测试性；评审者、日期、阻塞项和 `approved` 已记录在 `openspec/changes/fix-stock-analysis-price-chart/design.md#Review Result`。
- [x] 1.2 评审直接返回 `approved`，无需触发 `changes-required` 返工；生产代码仍须等待下一任务单独确认。

## 2. Pure Chart Contracts

- [x] 2.1 为 MA20/MA60 对齐、五个交易日刻度、Y 轴范围、交易日 X 间距、提示框边界、指针映射和指针/键盘选择先写失败 Node 测试；用 `cd apps/web && node --test --experimental-strip-types src/lib/price-trend-chart.test.ts` 验证 RED。
- [x] 2.2 在 `apps/web/src/lib/price-trend-chart.ts` 实现纯函数契约直到聚焦测试通过；聚焦 Node 测试 `13/13` 通过，新增文件级 TypeScript 检查通过。工作区全量 `check-types` 仍受既有过期路由生成物和缺失 `@dnd-kit` 依赖阻断，留到 task 5 复核。
- [x] 2.3 验证聚焦测试覆盖少于 60 点、空技术指标、少于两点、桌面/移动端几何、固定选择持久、首次聚焦、Escape 清除、Home/End、空序列和越界限制；15 项测试通过，行/函数覆盖率 100%、分支覆盖率 96.39%。`640px` 媒体查询依赖组件层，留到 task 3.1 验证。

## 3. Accessible SVG Component

- [x] 3.1 实现 `apps/web/src/components/charts/PriceTrendChart.tsx`，包含响应式 `760 × 280` / `420 × 320` viewBox、五个 `MM-DD` 刻度、MA/参考线、十字线、边界内提示框、键盘导航、实时读数和隐藏数据表；Web 测试、类型检查和生产构建通过。
- [x] 3.2 在 Preline 主题层补充 MA20/MA60 显式浅色和深色 token，验证组件只引用语义变量、深色态不会继承浅色均线色；真实深色截图通过。
- [x] 3.3 验证组件只使用项目语义图表 token、有可见焦点样式、通过全局规则支持 reduced motion，并在少于两个交易日时显示 `历史行情不足`；键盘焦点与空态截图通过。

## 4. Stock Analysis Integration

- [x] 4.1 用 `PriceTrendChart` 替换 `StockAnalysisDetail.tsx` 的本地伪 K 线 SVG，传入现有价格窗口和技术快照，删除重复的首尾日期页脚；Web 类型检查和生产构建通过。
- [x] 4.2 把副标题、徽标、指标和历史不足文案改为已确认文案；技术指标为空时保留 `技术指标待生成`；`rg` 已验证图表和页面文件中不再存在错误的 `K 线` 标签。
- [x] 4.3 验证现有 API 结构、数据库、Quant、复权和 Provider 路径未变化；仅将服务端研究摘要中的“K 线”展示文案修正为“收盘价”，并以定向回归测试锁定。

## 5. Integration Verification

- [x] 5.1 运行 `cd apps/web && pnpm test && pnpm check-types && pnpm lint && pnpm build`，再运行根目录 `pnpm lint && pnpm check-types`；验证每条命令退出码为 0 并记录输出摘要。
- [x] 5.2 截取已登录生产页面的桌面/移动端、浅色/深色、指针悬停、点击固定提示框和键盘导航证据；验证五个对齐的 `MM-DD` 刻度、完整日期提示、双主题可读、无横向溢出、无图片失败且无 AI 助手按钮遮挡。
- [x] 5.3 演练少于两点和 `technical=null` 状态；验证空态真实，部分数据仍展示收盘价趋势且没有 MA/参考线。
- [x] 5.4 编写 `openspec/changes/fix-stock-analysis-price-chart/verification.md`，记录命令、结果、截图路径、跳过项、环境限制和未解决问题；验证内容与最新命令输出一致。
- [x] 5.5 验证后停止并请求用户验收；用户于 2026-11-21 回复“继续”，明确接受结果并授权进入归档。

## Workflow follow-up

- 独立技术评审必须为 `approved`，之后才能执行任务 2.1 至 5.4。
- 只有用户验收和最终验证通过后才能归档。
