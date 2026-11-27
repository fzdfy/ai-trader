# Design

## Context

动机和用户行为见 [proposal.md](./proposal.md) 与
[spec.md](./specs/stock-forecast/spec.md)。

当前相关事实：

- 快速行情详情已有真实日 K 线，页面代码位于
  `apps/web/src/routes/home/market/stock/$symbol.tsx`。
- 个股分析已有 `historical-bootstrap-v1`，读取
  `marketDataReader.readDailyBars()` 的前复权展示数据，只生成周末端区间。
- `apps/quant/factor_eval.py` 已提供后复权、未来收益、IC/RankIC、分层检验和简单
  时间切分，但没有 purge/embargo，也不训练收益分布模型。
- `apps/quant/feature_store.py` 使用 `bar1d_qfq`，不能作为预测训练特征源。
- `instrument` 已保存 `list_date`、`delist_date` 和 `status`，可用于历史股票池。
- `board_constituent` 只保存当前成分关系，没有交易日版本，不能安全回填历史板块特征。
- `bar1d_hfq_at()` 已支持 PIT 复权读取，但当前复权快照历史深度必须在上线前审计。
- Quant 当前没有通用机器学习依赖；本次新增 `scikit-learn`。

本变更按 `risk: L2`、`assurance: systemic` 实施，跨数据库、Quant、Server 和
Web，并新增公共 API、模型依赖与 PIT 数据语义。

## Goals / Non-Goals

**Goals:**

- 在真实历史 K 线后展示未来五个交易日的概率路径。
- 用项目数据训练项目专属模型，并与条件化 bootstrap 基线统一比较。
- 通过 PIT、walk-forward、purge/embargo 和概率校准防止未来数据泄漏。
- 让预测快照、模型、特征和验证版本可重放、可审计。
- 单模块失败不影响行情和历史 K 线。

**Non-Goals:**

- 不实现盘中、1 日、20 日或 60 日新预测。
- 不修改个股分析页现有预测契约。
- 不引入 LLM、预训练时序 foundation model、PyTorch 或自动交易。
- 不提供投资建议、目标价、保证收益或仓位建议。
- 不在首期支持北交所。

## Decisions

### 1. Quant 负责训练、推理和路径生成

模型与路径计算放在 `apps/quant/forecast/`：

```text
forecast/
├── dataset.py       # PIT 股票池、行情、特征与标签面板
├── labels.py        # 5D 收益、波动阈值和三分类
├── features.py      # 价量、技术、市场与质量特征
├── baseline.py      # 条件化历史 bootstrap
├── model.py         # 分位数与分类模型、校准
├── path.py          # 5D OHLC block 路径生成
├── validation.py    # walk-forward、purge/embargo 与指标
├── artifacts.py     # 模型产物、哈希和版本
└── batch.py         # 批量训练、推理和快照写入
```

Server 不执行模型计算，只读取 PostgreSQL 快照并对外提供 API。这样复用 Quant 的
Pandas/Polars、因子与数据库能力，避免在 Node 服务复制数值代码。

替代方案：

- 全部放 Server：模型和 PIT 数据读取重复，训练任务阻塞 API，不采用。
- 在线按请求推理：延迟和峰值不可控，且无法统一批量快照，不采用。

### 2. 数据集使用独立 PIT 特征管线

不使用现有 `feature_store`。新管线按业务日构造，并固定：

```text
decision_at = 预测日 20:30 Asia/Shanghai
```

历史训练使用固定 `decision_at`；生产推理把实际管道完成时间作为 `decision_at`。
两者语义相同：`decision_at` 是唯一“当时可见”的数据截止时间；固定 20:30 只是历史
回放时钟，不能用于生产推理。所有值必须持久化，所有 PIT 查询使用
`known_at <= decision_at`，标签从 `decision_at` 之后的下一个交易日开始计数。

`bar1d_hfq_at` 的 `known_at` 只约束复权快照，日线记录还必须同时满足
`source_updated_at <= decision_at` 和 `ingested_at <= decision_at`。标签中的每个未来
收盘使用该未来业务日对应的固定 `decision_at`，防止晚到行情和事后回补进入当时可见
数据。必须构造晚到行情、回补行情和未来复权三类反泄漏测试。

- 股票池：`list_date <= t` 且 `delist_date is null or delist_date > t`，包含历史退市
  标的；
- 行情：`bar1d_hfq_at(symbol, t)`，且只使用 `known_at <= t` 的复权快照；
- 价量特征：1/5/10/20/60 日收益、波动率、MA 距离、RSI14、MACD、ADX/DI、
  ATR 比率、量比、OBV 斜率、20/60 日价格位置；
- 市场特征：上证指数趋势、全市场波动和广度；
- 质量：缺失率、停牌、上市历史长度和 PIT 快照可用性。

个股层技术信号通过 `forecast-technical-signals-v1` 白名单，从同一 PIT 日线面板按
历史时点重算：

- 10 项个股基础信号；
- 12 项 K 线形态；
- `advanced.stock.alpha_momentum`，使用市场指数而非当前行业映射；
- `advanced.stock.volatility_squeeze_breakout`。

Fama-French、质量、盈利修正、资金累积、筹码、行业相对强弱、事件驱动和多因子预期
收益等 8 项高级模型因需要财务、一致预期、资金流、历史成员关系或事件数据，首期标记
`unavailable` 且不进入训练。12 项微观结构信号同样不进入首期训练。禁止直接用只有
近期历史的实时技术信号快照回填历史。

市场广度先从同一 PIT 股票面板做独立的**全市场** set-based 聚合，按 `decision_at`
生成每日站上 MA200 比例、上涨股票比例和横截面波动，再 join 到各股票行。200 只
股票分块只用于股票级特征物化，不得在分块内分别计算广度。不得读取当前市场状态快照
回填历史。

所有特征版本写入 `feature_version`。横截面异常值在当前交易日内部 winsorize，
不得使用全样本分位数。

首期不使用股票所属板块、行业成分、板块动量和资金流特征。`board_constituent`
没有按交易日版本化的历史关系，用当前成分回填过去会泄漏未来调仓。以后只有在新增
历史成分快照和反泄漏测试后才能加入。

用户已于 2026-11-27 确认首期接受仅使用市场级上下文，PIT 数据不满足发布门禁时严格
停用预测，不以非 PIT 或未验证模型替代。

替代方案是继续复用 `feature_store`。该表来自前复权视图且没有完整 PIT 元数据，
会污染标签和验证，不采用。替代方案是直接使用当前板块映射，也有未来成分泄漏，
不采用。

训练数据以 Parquet 数据集构建：

- 按 200 只股票、126 个交易日分块执行 set-based PIT 查询；
- 使用 Polars lazy scan 分批写出带 `feature_version/decision_at` 的 Parquet；
- 单次训练最多加载 10,000,000 行，超过上限时缩短窗口或分片训练，不得静默截断；
- 数据集保存行数、标的数、日期范围、内存峰值和 SHA-256；
- 特征列使用固定前缀和压缩编码，训练从磁盘流式读取，不构造全市场宽 DataFrame。

### 3. 标签和方向阈值固定

- 目标：`ln(close[t+5] / close[t])`；
- 五日波动：基于 `t` 及以前 60 个日收益估计
  `sigma5 = std(log_returns[-60:]) * sqrt(5)`；
- 上涨：`target > 0.5 * sigma5`；
- 下跌：`target < -0.5 * sigma5`；
- 震荡：其余；
- 目标交易日无有效行情、长期停牌或 `sigma5 <= 0` 的样本剔除，并记录原因。

标签版本使用 `forecast-labels-v1`。方向阈值属于标签定义，任何改动必须升级版本。

### 4. 基线先于监督模型

基线使用唯一的 `forecast-baseline-v1` 条件化历史 5 日 OHLC block bootstrap：

- 按个股 60 日波动三分位、20 日趋势状态、市场波动状态和预测时点的流动性分桶；
- 只选择 `decision_at` 前已完成的 5 日历史块；
- 每桶至少 30 个完整块，否则逐级放宽同市场状态条件并记录降级；
- 每只股票采样 256 个 block，生成每日收盘分位和代表性路径；
- block 保留日内 open/high/low/close 关系，不独立采样四价。

替代方案是独立采样每日收益。该方法丢失路径自相关和日内关系，不采用。

### 5. 监督模型输出 5D 收益分布和方向概率

项目专属模型使用 `scikit-learn` 的 `HistGradientBoostingRegressor` 与
`HistGradientBoostingClassifier`：

- 三个分位数回归器预测 5D 收益 P10/P50/P90；
- 一个三分类器预测上涨/震荡/下跌；
- 分类概率在独立验证窗口做校准；每类至少 500 个样本时使用 isotonic，不足时使用
  Platt；仍不足时模型保持 candidate，不得生产启用；
- 训练按交易日等权，避免股票数量随上市时间变化导致日期偏权；
- 模型、校准器、特征清单和参数以 `stock-forecast-v1` 版本保存；
- 模型产物保存到 Quant 独占的 `forecast-models` volume，并在数据库记录 SHA-256。

路径生成以历史 blocks 为基础，用预测的 5D 中位数和区间中心/尺度做可逆调整，
再从调整后的 block 集合计算每日 P10/P50/P90 和三条代表性路径。

分位回归输出先执行单调修正：

```text
p10' = min(raw_p10, raw_p50, raw_p90)
p90' = max(raw_p10, raw_p50, raw_p90)
p50' = median(raw_p10, raw_p50, raw_p90)
```

路径调整使用固定公式：

```text
center_model = model_p50
scale_model = (model_p90 - model_p10) /
              (block_p90 - block_p10)
adjusted_block_return = center_model
  + scale_model * (block_return - block_p50)
```

当模型区间或 block 区间宽度低于 `1e-8` 时，`scale_model = 1`。调整后仍不能同时满足
正价格、OHLC 和末端分位容差时，快照 `quality` 为 `low` 或读取状态为 `unavailable`，
不得写入正式模型预测。

累计收益调整量 `(adjusted_block_return - block_return) / 5` 均分到五个每日对数收益，
高/低偏移使用相同 scale 调整并裁剪为正值。最终第五日路径 P10/P50/P90 与模型分位
差异不得超过 `0.005` 对数收益或模型区间宽度的 10%，取较大者；否则调优 scale 后
重算，仍失败则不发布该快照。

性质测试必须覆盖 `p10 <= p50 <= p90`、所有价格大于零，以及每条路径
`low <= min(open, close) <= max(open, close) <= high`。

三条代表性路径从调整后的 256 个 block 中按末端累计收益距离选择，分别取最接近
P20、P50、P80 的 block；路径必须去重并保持五个交易日的时间顺序。

替代方案：

- 通用 LLM：不可校准、不可稳定回测，不采用。
- 端到端深度学习：当前代码和运维没有训练基础设施，解释与回滚成本过高，不采用。
- 仅线性模型：可作为后续 challenger，但首期不足以建模非线性交互，不采用。

### 6. 统一滚动样本外门禁

验证使用 `forecast-validation-v1`：

- 每个 fold 使用 36 个月训练、6 个月验证、6 个月测试，步长 6 个月；
- 至少运行 3 个互不重叠的测试 fold；
- 每个训练 fold 至少包含 500 只股票、504 个交易日，验证/测试各至少 126 个交易日；
- 标签重叠区间设置至少 5 个交易日 purge/embargo；
- 训练/验证/测试不得重叠；
- 指标：CRPS、Pinball loss、Brier、ECE、80% 区间覆盖率、分市场状态稳定性；
- 市场状态固定为：
  - `risk_on`：上证指数 20 日收益大于 0 且 20 日波动不高于滚动中位数；
  - `risk_off`：上证指数 20 日收益不大于 0 且 20 日波动高于滚动中位数；
  - `transition`：其余；
- 任一测试 fold 的已知市场状态少于 30 个交易日时，必须报告样本不足，不得用其他
  状态替代；
- 分类和分位模型都必须优于 `forecast-baseline-v1`；
- 相对 CRPS 或 Pinball 改善至少 5%，覆盖率 75%–85%，Brier 与校准优于基线；
- 至少两个市场状态各不少于 30 个测试交易日，且模型在两者均优于基线；required
  状态样本不足时 model 不得上线；
- 未通过时模型保持 `candidate`，生产推理使用 baseline。

所有超参数和门槛必须在接触测试 fold 前冻结。验证通过后，使用截至上线日的全部合格
训练数据重新拟合最终 artifact；测试 fold 只用于验收，不参与调参或重新选模。

替代方案是一次性随机切分。金融样本重叠会产生泄漏，不采用。

### 7. 快照与 API 分离训练和读取

新增表：

```text
forecast_model_run
  model_version, status, feature_version, label_version, validation_version,
  train_range, validation_range, test_range, params_json, metrics_json,
  artifact_path, artifact_sha256, created_at, approved_at

forecast_validation
  model_version, validation_version, horizon_days, baseline_version, sample_count,
  metrics_json, baseline_metrics_json, regime_metrics_json,
  validation_start, validation_end, created_at

stock_forecast_snapshot
  symbol, as_of_trade_date, horizon_days,
  predictor_kind, predictor_version, model_version, baseline_version,
  feature_version, validation_version, decision_at, input_hash,
  random_seed, sessions_json, probabilities_json,
  paths_json, quality_json, computed_at
```

`forecast_model_run` 主键为 `model_version`。

`forecast_validation` 主键为
`model_version + validation_version + horizon_days`。

唯一键：

```text
stock_forecast_snapshot(
  symbol, as_of_trade_date, horizon_days,
  predictor_kind, predictor_version,
  feature_version, validation_version, input_hash
)
```

`predictor_kind` 为 `model | baseline`，`predictor_version` 指向实际结果来源版本；
`model_version` 记录当时的活动候选模型，便于审计。`predictionSource` 是持久化来源，
`availability` 在读取时由交易日历、`decision_at` 和当前时间动态计算。

Server 新增只读接口：

```text
GET /api/v1/stocks/:symbol/forecast?horizon=5D&asOf=YYYY-MM-DD
```

接口要求登录会话；`asOf` 可选，默认最近快照。提供 `asOf` 时返回最近不晚于该日期
的快照并回显实际日期，不存在则不回退到更晚日期。读取只访问数据库，不在请求中
训练或推理。

同一业务日存在多个快照时，优先当前 approved 的 `predictor_kind=model`，其次
`predictor_kind=baseline`，同类按 `computed_at DESC` 和 `predictor_version DESC`
确定唯一结果。

### 8. 页面在 K 线图上叠加预测，不伪造未来蜡烛

Web 新增 `useStockForecast` 和现有 Klinecharts 上的 `ForecastPathOverlay`，接入
快速行情详情。

- 历史 K 线保持现有 Klinecharts 渲染；
- 首期只在 `tf=1d` 显示预测；分钟、5 日、周和月视图不显示预测，并提示仅日 K 可用；
- 预测使用 Klinecharts overlay 与现有图表共享交易日索引和价格轴，不创建上下两张
  互不对齐的画布；
- 当存在未完成当日 K 线时，预测起点从最近一个完整交易日之后开始，历史未完成 bar
  不得被当作预测锚点；
- 预测起点后显示 80% 概率带、P50 中位路径和 P20/P50/P80 三条样本路径；
- 预测路径使用虚线或浅填充，不使用与历史相同的实心蜡烛；
- 卡片显示 `as_of`、预测日期、三种概率、区间、置信度、模型/基线和验证摘要；
- 预测区可折叠，默认展开最近有效快照；
- 加载、model、baseline、quality=low、stale、unsupported、unavailable、error
  均有独立状态；
- 历史 K 线与资金结构不受预测请求失败影响。

替代方案是直接绘制 5 根未来 K 线。该表达会让用户把估计值误认为事实，不采用。

### 9. 收盘后批量推理，月度重训

Server 同步 worker 在 `kline-1d`、`adj-factor` 和相关市场特征完成后触发 Quant
批量推理任务：

- 每日收盘后推理全量符合条件的沪深 A 股；
- 每月第一个交易日收盘后触发完整重训；
- 每周离线任务检查校准、覆盖率、特征漂移和模型状态；
- 异常重训产生新的 candidate，只有通过门禁后才更新 approved 模型版本；
- 推理按 200 只股票分块，避免一次性加载全市场；
- 任务结果写入现有 `job_run`，预测结果写入新快照表。

训练期间继续使用上一个 approved 模型。没有 approved 模型时使用 baseline；baseline
也无法满足 PIT/样本要求时返回 unavailable。

### 10. 降级不使用 LLM

持久化预测来源严格为：

```text
predictionSource: model | baseline
quality: available | low | missing
availability: current | stale | unsupported | unavailable | error
```

- `model`：approved 模型和完整输入；
- `baseline`：监督模型未批准或不可用；
- `quality: low`：来源仍是 model 或 baseline，但输入或样本质量不足；
- `stale`：最近快照早于预期业务日，由读取时动态计算，不写死到 snapshot；
- `unsupported`：北交所或未纳入范围；
- `unavailable`：无有效快照/历史；
- `error`：读取或计算失败。

LLM 只可读取已持久化的结构化结果生成解释，不得生成或补全价格和概率。

### 11. 预测数据和模型纳入数据治理

新增资产进入现有数据治理 registry：

- `forecast_model_run`：模型运行、artifact 和审批状态；
- `forecast_validation`：样本外证据和分市场状态指标；
- `stock_forecast_snapshot`：预测读取源；
- `forecast-models`：模型 artifact volume。

每个资产声明 owner、tier、数据契约、质量规则、血缘、消费门禁和保留策略。预测服务
在生成/读取前调用专用 consumer gate；数据质量失败时返回 `quality: low` 或
`availability: unavailable`。模型运行和验证记录长期保留；个股预测快照默认保留两年，
超过保留期由独立维护任务清理，模型 artifact 不随普通快照清理。`forecast-models`
volume 必须进入备份/恢复任务，至少保存最新 approved 和前一个 approved artifact。

## Bounded Condition Check

- 影响局限在一个服务或配置边界：不满足，跨 Quant、Server、Web、PostgreSQL。
- 不改变数据库 schema/数据语义/PIT/回测口径：不满足，新增预测表并建立 PIT 标签。
- 不改变权限模型/公共 API/跨服务契约：不满足，新增登录用户公共 API 和跨服务任务。
- 可通过代码或配置回滚且无需数据修复：不满足，需要处理已生成快照和模型 artifact。
- 现有测试可覆盖边界：不满足，需要新增模型、数据、API、UI 和运行时验证。

因此 `assurance: systemic` 成立，实施前必须独立设计评审，实施后必须独立代码与风险
评审。

## Visual Design

状态：`pending user confirmation`。

当前探索稿：

- [stock-five-day-forecast-v1.html](../../../docs/design/prototypes/explorations/stock-five-day-forecast-v1.html)
- [截图索引](../../../docs/design/prototypes/explorations/screenshots/stock-five-day-forecast-v1/README.md)
- 独立视觉复审：`8/10`，无阻断项，可提交用户视觉确认。
- 证据：39 张真实浏览器截图；浅色/深色状态报告均为 0 console error、
  0 page-level overflow、0 lint。
- 待完成：用户明确确认视觉方向后，在 `tasks.md` 追加实现任务。

技术设计评审通过后，必须为以下内容制作独立探索稿和真实截图：

- 目标页：`/home/market/stock/$symbol`；
- 历史/预测分界、概率带、中位路径、三条样本路径、图例与提示；
- 采用“未来一周路径预测”命名，与个股分析的“多周期历史情景”明确区分，并说明两页
  使用不同预测模型和版本；
- 所有预测状态；
- `1440×900`、`390×844`、浅色/深色、键盘焦点、屏幕阅读器说明和 reduced motion；
- 原型保存到 `docs/design/prototypes/explorations/`，不得覆盖历史 K 线参考稿。

视觉确认前，`tasks.md` 只允许包含视觉设计门禁。

## Risks / Trade-offs

- **PIT 历史不足**：现有复权快照历史只有单一时点，无法直接支持多年训练 → 发布前
  强制审计；60 个月是主门禁，500 个交易日只是最低完整性检查，并要求 90% 合格股票日具有可见复权
  快照、每个横截面至少 500 只股票，并覆盖至少 200 个退市/停牌历史标的。未满足时
  不批准模型或 baseline 上线，不退回非 PIT 训练。
- **幸存者偏差**：只用当前上市股票会高估效果 → 使用 `list_date/delist_date/status`
  构造历史股票池，并报告退市样本覆盖。
- **板块成员泄漏**：当前 `board_constituent` 没有历史日期版本 → 首期不纳入板块成员
  特征；未来加入前必须新增历史成分快照和反泄漏测试。
- **样本重叠泄漏**：5 日标签天然重叠 → 使用至少 5 日 purge/embargo 和滚动窗口。
- **模型过拟合**：监督模型可能样本外失效 → 与基线统一比较，未过门禁不生产启用。
- **路径误导**：未来路径仍可能被理解为确定走势 → 页面使用概率带、样本路径和明确
  文案，不画实心未来蜡烛。
- **训练与推理资源**：全市场训练成本高 → 月度离线 Parquet 数据集、200 股票分块
  查询/推理、模型缓存和 10,000,000 行上限；超出时缩短窗口或分片，不静默截断。
- **依赖风险**：新增 `scikit-learn` → 固定并锁定版本，模型 artifact 与依赖版本一起
  记录。
- **模型与路径不一致**：末端分位与 block 路径可能矛盾 → 固定 scale/center 调整、
  末端容差和 OHLC/分位性质测试。
- **预测状态混淆**：模型结果与新鲜度混成一个字段 → 拆分 `predictionSource` 和
  `availability`，`stale` 在读取时动态计算。
- **数据/模型漂移**：市场状态变化导致概率失真 → 周度校准、异常重训和自动降级。
- **模型 artifact 丢失**：预测无法重现 → 专属 volume、SHA-256、数据库元数据和备份。
- **回滚涉及预测记录**：新增表可能保留旧结果 → 回滚时关闭入口并保留快照为历史，
  不删除行情表或改写历史。

## Migration Plan

1. 审计并满足 PIT 发布门禁：复权快照深度、历史退市标的、停牌、交易日历和合格
   股票日覆盖率。
2. 增加 additive migration：模型运行、验证和预测快照表，并登记数据治理资产。
3. 增加 Quant 特征、标签、基线、模型、路径和验证模块。
4. 生成并验证 baseline，先建立 snapshot/API 契约。
5. 训练 candidate 模型并运行统一门禁；未通过时只发布 baseline 能力。
6. 增加批量推理与月度重训任务，写入 `job_run`。
7. 技术设计评审通过后制作视觉探索；视觉确认后再拆 UI 实施任务。
8. 接入 Web，完成功能、视觉、响应式、主题、键盘和行为回归。

回滚：

- 关闭预测 API 与页面入口；
- 保留新增表和带模型版本的历史快照，不删除业务数据；
- 撤销 cron 触发和 `scikit-learn` 依赖；
- 不修改现有历史 K 线、个股分析预测、行情或复权契约；
- 模型 artifacts 保留为审计对象，不作为活动模型加载。

## Open Questions

无。模型类型、全局训练、首期股票范围、重训频率、降级策略、路径数量、页面位置和
视觉门禁均已确认。

## Review Result

- 日期：2026-11-27
- 评审者：独立技术设计评审代理
- 结论：`approved`
- 评审过程：
  - 首轮发现 2 个 Critical、8 个 Important，覆盖板块成员泄漏、PIT 可见时间、
    技术信号边界、样本外窗口、路径一致性、训练资源、状态字段、快照键和治理；
  - 第二轮继续修正行情入库时点、技术信号白名单和来源/质量字段；
  - 最终复评无 Critical、无 Important，批准进入视觉门禁。
- 剩余风险：60 个月 PIT 数据覆盖、退市样本和模型真实效果必须在实施前数据审计与
  样本外训练中验证；未满足时严格停用预测。
