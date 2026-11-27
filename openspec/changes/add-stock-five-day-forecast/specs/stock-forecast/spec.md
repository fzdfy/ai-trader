# Spec Delta

## Purpose

为单只沪深 A 股提供未来五个交易日可追溯、可校准的概率化价格路径，并在快速行情 K 线详情中明确区分历史事实与预测情景。

## ADDED Requirements

### Requirement: Five-day forecast is probabilistic

系统 SHALL 为沪深 A 股输出未来五个交易日的 Forecast Path Envelope，而不是确定的未来 OHLC 蜡烛或单一目标价。

#### Scenario: A forecast is available

- **WHEN** 股票拥有满足门槛的 PIT 历史、特征和预测快照
- **THEN** 系统 MUST 返回五个预测交易日
- **AND** 每个交易日 MUST 包含收盘 P10、P50、P90
- **AND** 响应 MUST 包含上涨、震荡和下跌概率
- **AND** 响应 MUST 包含 P20、P50、P80 三条具有真实历史 OHLC 关系的代表性路径

#### Scenario: A forecast is unavailable

- **WHEN** 历史、特征或有效样本不足
- **THEN** 系统 MUST 返回 `availability: unavailable` 或 `quality: low`
- **AND** MUST NOT 返回零值、替代股票数据或确定性目标价

### Requirement: Forecasts use point-in-time inputs and labels

预测特征和训练标签 SHALL 使用业务时点可见的后复权行情，不得使用前复权展示数据或未来复权快照。

#### Scenario: Features are built for a historical session

- **WHEN** 系统构造业务日 `t` 的决策时点 `decision_at`
- **THEN** 特征 MUST 使用 `known_at <= decision_at` 的 PIT 复权快照
- **AND** 行情行 MUST 同时满足 `source_updated_at <= decision_at` 和 `ingested_at <= decision_at`
- **AND** 未来五交易日标签 MUST 使用同一后复权口径计算
- **AND** 停牌或无目标交易日有效行情的样本 MUST 被排除并记录

#### Scenario: A late or backfilled bar would be visible

- **WHEN** 某个历史日线在对应 `decision_at` 之后才更新或入库
- **THEN** 该记录 MUST NOT 进入当时的特征面板
- **AND** 特征和标签构造 MUST 有反泄漏测试覆盖晚到行情和事后回补

#### Scenario: Historical board membership is unavailable

- **WHEN** 板块成分关系没有按交易日版本化的历史快照
- **THEN** 首期 MUST NOT 使用依赖股票所属板块成员关系的特征
- **AND** 系统 MAY 使用不依赖未来成分映射的纯市场级特征

#### Scenario: Historical technical signals are reconstructed

- **WHEN** 模型使用个股技术信号特征
- **THEN** 信号 MUST 从同一 PIT 日线面板按历史时点重算
- **AND** MUST NOT 读取只有近期历史的实时信号快照回填过去
- **AND** 依赖逐笔或 Level 2 的微观结构信号 MUST 标记不可用且不进入训练

#### Scenario: Forecast is generated during a trading session

- **WHEN** 最近交易日尚未形成完整收盘数据
- **THEN** 系统 MUST 使用最近一个已完成交易日快照
- **AND** 页面 MUST 标记 `as_of` 与陈旧状态
- **AND** MUST NOT 用盘中价格伪造新的日 K 预测

### Requirement: Model prediction requires an out-of-sample gate

系统 SHALL 同时保留 `forecast-baseline-v1` 条件化历史 bootstrap 和项目专属监督模型，并仅允许通过统一样本外门槛的模型进入生产预测。

#### Scenario: A model qualifies

- **WHEN** 模型在滚动样本外评估中相对基线降低 CRPS 或 Pinball loss 至少 5%
- **AND** 80% 区间覆盖率位于 75%–85%
- **AND** Brier score 与概率校准优于基线
- **AND** 至少两个市场状态各拥有不少于 30 个测试交易日
- **AND** 模型在这两个市场状态均优于 `forecast-baseline-v1`
- **THEN** 系统 MAY 返回 `predictionSource: model`
- **AND** 响应 MUST 包含模型版本和验证版本

#### Scenario: A model does not qualify

- **WHEN** 模型未通过任一验收门槛或被暂停
- **THEN** 系统 MUST 返回 `forecast-baseline-v1`
- **AND** `predictionSource` MUST 为 `baseline`
- **AND** MUST NOT 把基线结果描述为监督模型预测

#### Scenario: Validation avoids leakage

- **WHEN** 系统执行滚动 walk-forward 验证
- **THEN** 训练、验证和测试 MUST 按时间推进
- **AND** 相邻标签 MUST 设置至少五个交易日 purge/embargo
- **AND** MUST NOT 使用随机切分或未来数据标准化

### Requirement: Forecast direction uses volatility-scaled thresholds

上涨、震荡和下跌 SHALL 使用未来五日收益相对个股波动尺度的分类，不得对所有股票使用固定百分比。

#### Scenario: Direction probabilities are calculated

- **WHEN** 系统分类未来五个交易日收益
- **THEN** 标签 MUST 为 `ln(close[t+5] / close[t])`
- **AND** 中性阈值 MUST 使用个股 60 日波动率换算的五日波动 `±0.5σ5`
- **AND** 响应 MUST 返回实际阈值及口径版本

#### Scenario: Daily paths agree with terminal quantiles

- **WHEN** 系统从历史 OHLC blocks 生成五个交易日路径
- **THEN** 每日 P10/P50/P90 MUST 单调且价格为正
- **AND** 每条路径 MUST 满足 `low <= min(open, close) <= max(open, close) <= high`
- **AND** 第五日路径分位 MUST 在定义容差内与监督模型末端分位一致

### Requirement: Forecast snapshots are immutable and traceable

每个预测 SHALL 由股票、已完成业务日、预测来源种类与版本、特征版本、验证版本和输入哈希唯一标识，并保留训练、推理和验证证据。

#### Scenario: A snapshot is stored

- **WHEN** 收盘后批量推理完成
- **THEN** 系统 MUST 保存 `symbol`、`as_of_trade_date`、模型版本、基线版本、特征版本、验证版本、输入哈希、随机种子、预测路径、概率、质量和计算时间
- **AND** 相同输入与版本重跑 MUST 幂等返回同一业务快照

#### Scenario: Inputs change

- **WHEN** 行情、特征、模型或验证版本变化
- **THEN** 系统 MUST 生成新快照
- **AND** 旧快照 MUST 保留并标记为历史版本

### Requirement: Forecast API exposes typed availability states

个股预测读取接口 SHALL 使用稳定响应结构分别表达预测来源、结果质量和读取可用性。

#### Scenario: Client reads a forecast

- **WHEN** 客户端请求 `GET /api/v1/stocks/:symbol/forecast?horizon=5D`
- **THEN** 响应 MUST 包含 `predictionSource`、`availability`、`asOfTradeDate`、`decisionAt`、`sessions`、`probabilities`、`paths`、`quality` 和版本字段
- **AND** `predictionSource` MUST 为 `model | baseline | null` 之一
- **AND** `predictionSource: null` MUST 仅与 `unsupported`、`unavailable` 或 `error` 同时出现
- **AND** `quality` MUST 为 `available | low | missing` 之一
- **AND** `availability` MUST 为 `current | stale | unsupported | unavailable | error` 之一

#### Scenario: Client requests a historical date

- **WHEN** 客户端提供不存在的精确 `asOf`
- **THEN** 系统 MUST 返回最近不晚于该日期的快照
- **AND** 响应 MUST 回显实际快照日期

#### Scenario: Multiple snapshots exist for one date

- **WHEN** 同一交易日存在多个可用预测版本
- **THEN** 系统 MUST 优先读取当前 approved 的 model 快照
- **AND** 没有合格 model 时 MUST 读取最新 baseline 快照
- **AND** 同类快照 MUST 按计算时间和版本稳定排序

#### Scenario: No snapshot exists at or before the requested date

- **WHEN** 客户端请求的历史日期之前没有任何可用快照
- **THEN** 系统 MUST 返回 `availability: unavailable`
- **AND** `predictionSource` MUST 为 `null`
- **AND** `quality` MUST 为 `missing`
- **AND** `sessions` 与 `paths` MUST 为空数组

#### Scenario: Client requests an unsupported stock

- **WHEN** 标的属于北交所或未满足首期支持范围
- **THEN** 系统 MUST 返回 `unsupported`
- **AND** MUST 说明原因
- **AND** MUST NOT 用沪深样本替代该标的

#### Scenario: Forecast data governance gate blocks a snapshot

- **WHEN** 行情、复权、特征或预测快照未通过专用数据质量门禁
- **THEN** 系统 MUST 返回 `availability: unavailable` 或 `quality: low`
- **AND** MUST 提供可理解的阻断原因
- **AND** MUST NOT 绕过门禁返回预测结果

### Requirement: Quick quote detail separates history from forecast

快速行情详情 SHALL 在真实历史 K 线右侧呈现未来五个交易日的预测区域，并明确视觉区分预测与事实。

#### Scenario: User views a qualified forecast

- **WHEN** 快速行情详情取得 `predictionSource: model` 或 `predictionSource: baseline` 且 `availability: current`
- **THEN** 页面 MUST 保留真实历史 K 线
- **AND** 预测区域 MUST 使用概率带和虚线或样本路径
- **AND** 页面 MUST NOT 把未来预测绘制为与历史相同的实心 K 线
- **AND** 页面 MUST 显示预测起点、交易日期、`as_of`、区间、概率和模型/基线状态

#### Scenario: User switches away from daily candles

- **WHEN** K 线周期为分钟、5 日、周或月
- **THEN** 页面 MUST NOT 在该周期叠加 5D 日线预测
- **AND** 页面 MUST 提示预测仅在日 K 视图可用

#### Scenario: Forecast fails independently

- **WHEN** 预测请求失败或无可用快照
- **THEN** 历史 K 线、行情摘要和资金结构 MUST 继续可用
- **AND** 预测区域 MUST 显示独立错误、空状态或降级原因
- **AND** 用户 MUST 能单独重试预测区域

### Requirement: Forecast presentation is accessible and responsive

预测区域 SHALL 在桌面与移动端、浅色与深色主题下保持可读，并为非视觉用户提供路径和概率的文本等价信息。

#### Scenario: Keyboard or screen-reader user inspects the forecast

- **WHEN** 用户使用键盘或 assistive technology 浏览预测区域
- **THEN** 图表 MUST 提供可访问名称
- **AND** 五个预测交易日 MUST 可逐日读取日期、P10/P50/P90 和概率
- **AND** 当前选择 MUST 有可见焦点和读屏同步

#### Scenario: User views the forecast on mobile

- **WHEN** 视口为 `390×844`
- **THEN** 概率带、路径、预测起点和关键图例 MUST 无裁切或重叠
- **AND** 页面 MUST NOT 产生页面级横向溢出

#### Scenario: Reduced motion is enabled

- **WHEN** 用户启用 reduced motion
- **THEN** 预测区域 MUST NOT 播放非必要动画

### Requirement: AI cannot invent forecast numbers

AI 助手和分析摘要 MAY 解释结构化预测，但 MUST NOT 生成、修改或补全预测价格、概率和胜率。

#### Scenario: AI summarizes a forecast

- **WHEN** AI 生成预测说明
- **THEN** 每个数值 MUST 引用 Forecast Snapshot
- **AND** 文案 MUST 说明这是概率情景而非目标价
- **AND** 缺少证据时 MUST 说明无法判断
