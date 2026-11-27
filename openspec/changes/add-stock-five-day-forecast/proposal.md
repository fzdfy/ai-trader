# Proposal

## Change Metadata

- type: feature
- risk: L2
- assurance: systemic
- baseline: spec
- visual: new-design

## Why

快速行情详情目前只展示真实历史 K 线和资金结构，用户无法看到未来一周可能的价格路径与不确定性。现有个股分析虽有 5D/20D/60D 历史 bootstrap 情景，但只给出周末端区间，使用前复权展示数据，未使用项目因子和技术信号，也没有严格的滚动样本外验证。

本变更在快速行情 K 线详情中增加未来 5 个交易日的概率化路径带，让用户在同一价格尺度下观察历史走势、未来中枢、风险范围和代表性情景，同时不制造确定的未来 OHLC 蜡烛或买卖指令。

## PRD-lite

### 目标用户与场景

- 目标用户：登录后研究 A 股行情的个人研究者。
- 核心场景：用户从行情中心打开个股快速详情，在查看历史 K 线后，切换或展开“未来一周”预测区域，判断未来 5 个交易日的大致方向、波动范围、风险和证据质量。
- 用户下一步：继续观察、加入自选、进入个股分析或调整研究优先级。

### 用户价值

- 把“可能怎么走”和“范围多大”放在真实 K 线上下文中。
- 明确区分历史事实、数学预测和模型置信度。
- 通过项目数据训练的模型、概率校准和样本外验证，替代单点目标价。

### 成功指标

- 80% 预测区间在样本外覆盖 75%–85% 的真实结果。
- 模型 CRPS / Pinball loss 比 `forecast-baseline-v1` 条件化基线优至少 5%。
- 三分类 Brier score 与概率校准优于基线。
- 至少跨两种市场状态保持有效。
- 预测接口失败或数据不足时，历史 K 线仍可正常使用。

### 非目标

- 不提供 1 日、盘中或买入/卖出时点预测。
- 不输出确定性目标价、收益承诺或自动交易指令。
- 不使用通用 LLM 生成预测数字。
- 首期不支持北交所股票。
- 不修改个股分析页现有 5D/20D/60D 情景预测。
- 不把未来 OHLC 绘制成与历史 K 线同等确定性的实心蜡烛。

## What Changes

- 新增 `stock-forecast` 能力，为沪深 A 股生成未来 5 个交易日的 Forecast Path Envelope。
- 预测输入使用 `hfq + known_at <= decision_at` 的 PIT 行情、价量技术特征、指数趋势和市场状态；首期不使用依赖当前板块成分关系的历史行业特征。
- 新增项目专属全局模型：分位数回归与三分类概率模型，使用滚动 walk-forward、5 日 purge/embargo 和概率校准验证。
- 保留唯一的 `forecast-baseline-v1` 条件化历史 bootstrap 作为基线；监督模型只有在严格样本外评估优于该基线时才可启用。
- 新增不可变 Forecast Snapshot、读取 API 和三级降级状态。
- 在快速行情详情 K 线图中增加预测切换或展开区域，显示 80% 概率带、中位路径和 P20/P50/P80 三条历史样本路径。
- 新增 `scikit-learn` Python 依赖，用于项目专属模型训练与推理。

## Capabilities

### New Capabilities

- `stock-forecast`: 单只沪深 A 股未来 5 个交易日概率化 K 线路径、模型验证、快照、API、降级和页面呈现。

### Modified Capabilities

无。

## Acceptance Criteria

- **AC-1**：系统 SHALL 仅按最近一个已完成交易日收盘生成未来 5 个交易日预测，并保存 `as_of_trade_date`、`decision_at`、模型版本、特征版本、验证版本、输入哈希和随机种子。
- **AC-2**：训练特征和标签 SHALL 使用 `bar1d_hfq_at(symbol, decision_at)`，并同时满足 `known_at <= decision_at`、`source_updated_at <= decision_at` 和 `ingested_at <= decision_at`；不得使用前复权展示数据、晚到行情或事后回补数据。
- **AC-3**：5D 收益标签 SHALL 为 `ln(close[t+5] / close[t])`；上涨、震荡、下跌 SHALL 按个股 60 日波动率换算的 5 日波动 `σ5` 分类，阈值为 `±0.5σ5`。
- **AC-4**：系统 SHALL 同时实现 `forecast-baseline-v1` 和项目专属监督模型；监督模型只有在滚动样本外 CRPS/Pinball loss 比该基线优至少 5%、80% 区间覆盖率位于 75%–85%、Brier 与校准均优于基线，且至少两个市场状态各不少于 30 个测试交易日并分别优于基线时，才能返回 `predictionSource: model`。
- **AC-5**：滚动验证 SHALL 按时间推进，标签重叠区间 MUST 设置至少 5 个交易日 purge/embargo，不得使用随机切分。
- **AC-6**：预测 SHALL 输出未来 5 个交易日的 P10/P50/P90 收盘路径、80% 概率带、上涨/震荡/下跌概率，以及 P20/P50/P80 三条保留真实 OHLC 关系的代表性路径。
- **AC-7**：系统 SHALL 分离持久化的 `predictionSource`（`model | baseline | null`）、结果 `quality`（`available | low | missing`）和读取时的 `availability`（`current | stale | unsupported | unavailable | error`）；`predictionSource: null` 只用于不存在预测的 `unsupported`、`unavailable` 或 `error`；模型修复或输入变化后 MUST 重新生成快照。
- **AC-8**：首期 SHALL 支持有足够 PIT 历史的沪深 A 股；北交所 MUST 返回 `availability: unsupported`，样本不足股票 MUST 返回 `quality: low` 或 `availability: unavailable`，不得用其他股票数据替代。
- **AC-9**：快速行情详情 SHALL 在真实历史 K 线右侧显示预测区域，使用概率带和虚线/样本路径，不得绘制为确定的未来实心 K 线。
- **AC-10**：预测区域 SHALL 显示预测日期、`as_of`、模型/基线状态、上涨/震荡/下跌概率、80% 区间、置信度、模型版本和验证摘要。
- **AC-11**：预测接口失败、数据质量阻断或样本不足 SHALL NOT 清空历史 K 线和资金结构；页面 MUST 显示隔离错误或空状态。
- **AC-12**：预测 SHALL 支持桌面和移动端、浅色和深色、键盘焦点、屏幕阅读器说明和 reduced motion；所有可见状态 MUST 经过用户视觉确认后才能进入生产实现。
- **AC-13**：AI 助手或摘要 MAY 引用结构化预测结果，但 MUST NOT 生成未由快照提供的价格、概率或胜率。
- **AC-14**：每日收盘后批量推理，每月完整重训，每周检查概率校准和特征漂移；异常重训后的新模型 MUST 重新通过相同验收门禁。
- **AC-15**：三张预测表和模型 artifact SHALL 进入数据治理注册、质量检查、血缘、消费门禁和保留策略；预测不得绕过数据治理门禁。

## Impact

- 数据：PIT 复权读取、历史样本审计、退市/停牌覆盖、Forecast Snapshot、训练与验证元数据。
- Quant：`scikit-learn`、标签构造、特征面板、基线、监督模型、路径生成、滚动验证和批量推理。
- Server：预测快照读取、API、状态和降级。
- Web：快速行情详情 K 线预测区域、加载/成功/基线/低置信/陈旧/不支持/错误状态。
- 公共 API：新增个股 5D 预测读取接口。
- 依赖：新增 `scikit-learn`。
- 兼容性：个股分析页现有预测保持不变；历史 K 线、行情和资金接口保持不变。
- 回滚：关闭预测 API 与页面入口，保留历史快照；删除模型依赖前先版本化模型产物，不修改历史行情与复权契约。

## Visual Design Impact

Visual design: required.

- 目标页面：`/home/market/stock/$symbol` 快速行情详情的 K 线区域。
- 受影响状态：加载、模型预测、统计基线、低置信、陈旧、不支持、错误、无足够历史、部分成功、成功。
- 必须检查：历史 K 线与预测起点区分、概率带层级、三条路径可辨识度、键盘和屏幕阅读器说明、桌面 `1440×900`、移动端 `390×844`、浅色/深色和 reduced motion。
- 视觉探索必须在技术设计评审后开始，保存到 `docs/design/prototypes/explorations/`，不得覆盖既有历史 K 线原型。
