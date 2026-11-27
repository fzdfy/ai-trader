# Tasks

## 0. Visual Design Gate

- [x] 0.1 从用户提供的线上 `/home/market` 页面保存不含账号凭据的本地 DOM 快照，覆盖总览、板块、板块详情、个股列表、快速行情详情和个股分析；核对原有导航、主要指数、市场温度、板块排行/热力图和个股结构保持不变。
- [x] 0.2 在线上快照中增量插入信号区，覆盖总览摘要、板块列表摘要、板块详情 32 项矩阵、个股列表摘要、快速详情标签、黄金详情和个股分析 44 项矩阵；核对所有页面状态可到达。
- [x] 0.3 生成 `1440×900`、`390×844`、浅色和深色真实截图，保存到 `docs/design/prototypes/explorations/screenshots/live-latest-signal-integration-v1/`；运行截图工具检查控制台、图片加载、横向溢出和对比度，并记录报告。
- [x] 0.4 对新增信号矩阵执行键盘、焦点、展开、筛选和 reduced-motion 检查；核对浅色/深色语义 token、移动端页面级无横向溢出及黄金量能“不适用”表达。
- [x] 0.5 提交原型、截图和差异说明给用户视觉确认；用户已确认最终信息层级和合并后的视觉方案。

## 1. Shared Signal Catalog And Contract

- [x] 1.1 创建 `packages/signal-catalog`、版本化 `catalog.json` 和 TypeScript 入口，定义 140 个稳定 `signal_id`、层级、对象、参数、规则说明与数据要求；验证目录数量为 40/48/40/12，并运行包级目录测试。
- [x] 1.2 为 Quant 和 Server 建立同一份 catalog golden fixture，验证 Python loader 与 TypeScript loader 返回的 ID、参数和定义哈希一致。
- [x] 1.3 定义共享 `SignalStatus`、`SignalResult`、`SignalSnapshot` JSON 契约和运行时校验；验证重复 ID、未知状态、非有限数值和跨对象 subtype 缺失均被拒绝。
- [x] 1.4 增加 `technical-signals-1.0.0` 参数快照与规则版本测试，验证任一公式或阈值变化必须改变 catalog version。

## 2. Quant Technical Computation

- [x] 2.1 为现有 `TechnicalSnapshot` 建立冻结 fixture，记录测试 OHLCV 序列的 MA、RSI、ATR、波动率、支撑压力、区间收益和回撤期望值；新增服务实现前验证 fixture 可加载。
- [x] 2.2 在 Quant 实现批量技术快照和 10 个基础信号，返回兼容字段与新信号原语；运行 `cd apps/quant && uv run pytest tests/test_technical_signals.py -q`，验证 `as_of` 和有限数值。
- [x] 2.3 在 Quant 实现 12 个 K 线形态候选、确认条件和组成证据；使用突破、回踩、假突破、顶部和破位 fixture 验证状态与失效条件。
- [x] 2.4 在 Quant 实现可用微观结构原语及 `proxy/unavailable` 边界，覆盖日线、最近交易日分笔、时点盘口和无历史盘口场景；验证代理值不会被标记为高置信。
- [x] 2.5 增加 `/api/v1/signals/evaluate` 批量端点、输入上限、取消和超时；用超限批次、空批次和部分对象失败测试验证错误隔离。
- [x] 2.6 锁定 Quant 输出与共享 JSON 契约，使用跨语言 golden response 验证 Server 不需要理解 Quant 内部实现。

## 3. Signal Persistence

- [x] 3.1 增加 `technical_signal_snapshot`、`technical_signal_trigger` 和 `technical_signal_validation` Drizzle schema 与迁移；验证 subtype、as-of、catalog version 和 signal ID 主键/索引正确。
- [x] 3.2 实现快照写入、触发索引和按对象读取，验证相同对象/日期/版本重复写入保持幂等。
- [x] 3.3 验证历史读取返回快照保存的 catalog version 和 definition hash，不套用新规则。
- [x] 3.4 增加旧表回归检查，确认行情、复权、PIT、回测、资金和现有个股分析表未发生结构变化。

## 4. Server Signal Domain

- [x] 4.1 实现对象适配器：market、sector(industry/concept)、stock、gold 分别读取正确序列、基准和辅助数据，并用 fixture 验证 subtype 与基准口径。
- [x] 4.2 实现基础信号和形态的 Server 合并、资产级确认、状态和证据映射；验证大盘/板块不得只依赖单根指数 K 线完成确认。
- [x] 4.3 实现 10 个大盘高级模型、10 个板块高级模型和 10 个个股高级模型；分别验证数据缺失、部分因子和完整模型状态。
- [x] 4.4 实现黄金高级模型目录与数据要求，验证未接入项返回 `unavailable`、XAU 量能项返回 `not-applicable`。
- [x] 4.5 实现信号目录、对象详情和单信号查询 API；验证非法 scope、缺失 subtype、非法 signal ID 和不存在快照的稳定响应。
- [x] 4.6 实现个股列表当前页批量摘要 API；验证只返回当前页 10 只股票，不生成完整矩阵或跨页全量计算。
- [x] 4.7 在个股分析聚合响应中增加 `technicalSignals`，并将现有技术快照改为 Quant 单一来源；运行 Server 单元测试和现有个股分析契约回归。

## 5. Worker Orchestration

- [x] 5.1 增加收盘后 `technical-signals-market`、`technical-signals-boards` 和 `technical-signals-stocks` 任务，按板块、大盘、黄金、个股的依赖顺序执行；验证批次边界和 deadline。
- [x] 5.2 将 Quant 调用按每批最多 200 个对象执行，验证失败批次独立重试、成功批次不被回滚。
- [x] 5.3 将技术信号任务加入 cron 依赖图，依赖 `kline-1d`、`adj-factor`、`boards`、`board-kline`、`fundflow` 和市场资产同步；验证不满足前置数据时跳过而非写入伪结果。
- [x] 5.4 增加 `request_id`、`job_run_id`、catalog version、对象数、失败数和低质量数的日志字段。

## 6. Shared Frontend Signal Components

- [x] 6.1 在 `apps/web/src/components` 实现共享 `SignalDiagnosis` 组件，支持层签、统一筛选、状态、展开证据、空/错误/部分成功和移动端布局；验证组件单测与键盘交互。
- [x] 6.2 实现 `SignalCell` 与 `MarketRegimeStrip`，分别用于表格摘要和总览宏观状态；验证只渲染摘要字段，不携带完整矩阵。
- [x] 6.3 使用 Preline/Tailwind 语义 token 完成浅色/深色、390×844、焦点和 reduced-motion 样式；验证生产截图与探索稿一致。

## 7. Market Center Integration

- [x] 7.1 行情中心总览接入合并后的 A 股宏观状态模块，成长/红利低波只作为高级模型证据；验证主要指数、市场温度和宏观状态不重复呈现同一指标。
- [x] 7.2 板块列表在现有排行表增加“技术状态”列，合并阶段与技术摘要；验证排序、分页和移动端无横向溢出。
- [x] 7.3 板块详情接入单卡分层技术诊断，位于概览与成分股之间；验证三层层签、共享筛选、部分失败和详情深链接。
- [x] 7.4 个股列表接入单列技术摘要，快速行情详情接入紧凑标签与个股分析入口；验证摘要不重复完整矩阵。
- [x] 7.5 黄金详情接入合并后的资产摘要和技术诊断，并从大类资产轮动提供入口；验证不新增一级 Tab、XAU 量能状态正确。

## 8. Stock Analysis Integration

- [x] 8.1 在价格趋势之后接入单卡四层技术诊断，验证基础/K线/高级/微观标签共享一个筛选器。
- [x] 8.2 合并“情景预测”和“风险参考区间”展示，消除 20D P10/P50/P90 重复；验证三个窗口和风险来源仍可访问。
- [x] 8.3 移除价格趋势中与技术诊断重复的数值条，保留图表、图例、悬浮读数和全局数据状态；验证现有价格趋势交互不回归。
- [x] 8.4 仅展示异常、低置信、过期和缺失状态徽标，普通“可用”只在全局质量条出现；验证视觉和屏幕阅读器状态。

## 9. Quality, Performance, And Verification

- [x] 9.1 增加目录一致性、Quant/Server 契约、快照幂等和非法输入测试，验证所有 AC-1 至 AC-4。
- [x] 9.2 增加页面摘要、详情、层签、筛选、独立失败和黄金入口测试，验证 AC-5 至 AC-9。
- [x] 9.3 增加“无验证证据不得展示胜率”的 API/UI 测试，验证 AC-10。
- [x] 9.4 验证列表摘要查询和详情请求达到性能预算；记录批次耗时、对象覆盖、失败率和缓存命中。
- [x] 9.5 运行 `pnpm check-types`、`pnpm lint`、Server 测试、Web 测试、Quant pytest 和受影响的构建命令，记录目前最新结果。
- [x] 9.6 按 L2 要求执行独立代码与风险审查，覆盖数据口径、快照回滚、XAU 不适用、PIT/复权边界和 UI 可访问性。
- [x] 9.7 生成最终桌面/移动端和浅色/深色截图，更新 `verification.md` 的 AC 证据映射并提交用户验收。
- [x] 9.8 修复工作台主内容滚到底后继续传递给 `body` 造成整页上移和大块空白；验证桌面与移动端滚到底时 `window.scrollY` 保持 `0`，并重新截图确认内容紧贴滚动边界。

## 10. Layered Signal Judgment Visual Gate

- [x] 10.1 在现有线上页面副本的每个原信号区内部嵌入对象总判断、基础信号判断、K 线形态判断、高级模型判断和个股微观结构辅助判断，不另建独立页面或独立模块；覆盖大盘、板块、个股、黄金以及成功、部分成功、证据不足状态。
- [x] 10.2 生成 `1440×900`、`390×844`、浅色和深色真实截图，保存到 `docs/design/prototypes/explorations/screenshots/live-signal-judgments-integrated-v1/`，并运行截图工具检查控制台、图片加载、横向溢出和对比度。
- [x] 10.3 提交探索稿和截图给用户确认；用户已确认原地嵌入、对象总判断和逐层判断方案。

## 11. Layered Signal Judgment

- [x] 11.1 在共享信号契约中定义 `signal-judgment-1.0.0` 摘要、总判断、分层判断、计数和置信度类型及运行时语义校验；验证版本、字段和计数一致性。
- [x] 11.2 在 Server 实现确定性分层聚合，验证核心层投票、低置信/不可用/不适用排除、分歧与证据不足，以及个股微观结构只调整置信度。
- [x] 11.3 将判断摘要写入技术信号快照 `summary_json`，并在快照、个股分析响应和 Web 类型中透传；验证 Worker 重算后同对象/日期/版本返回同一 `summaryVersion`。
- [x] 11.4 在 `SignalDiagnosis` 原信号面板头部之后渲染对象总判断，在每个原层级内容顶部渲染层判断和计数；总判断层入口可切换到原层级，验证键盘、移动端、浅色和深色。
- [x] 11.5 运行契约、Server、Web 测试和完整验证，重新生成真实页面明暗/桌面移动截图，更新 `verification.md` 后提交用户验收。
