# 行情中心与个股技术信号矩阵技术设计

- 状态：proposed
- 变更：[add-market-technical-signal-matrix](../../../openspec/changes/add-market-technical-signal-matrix/proposal.md)
- 规格：
  - [technical-signal-analysis](../../../openspec/changes/add-market-technical-signal-matrix/specs/technical-signal-analysis/spec.md)
  - [market-center](../../../openspec/changes/add-market-technical-signal-matrix/specs/market-center/spec.md)
  - [stock-analysis-workbench](../../../openspec/changes/add-market-technical-signal-matrix/specs/stock-analysis-workbench/spec.md)
  - [preline-workbench-ui](../../../openspec/changes/add-market-technical-signal-matrix/specs/preline-workbench-ui/spec.md)
- 日期：2026-11-26

## Context

现有系统已有 Python 技术因子注册表、qfq/hfq 派生视图、日线 K 线、板块 K 线、资金流、筹码、财务、估值、研报、伦敦金日线和个股分析聚合接口。当前技术计算分散在 `apps/quant` 与 `apps/server/src/lib/stock-analysis-data.ts`，行情中心没有统一信号契约，微观结构表已有设计但盘口历史写入尚未接入。

本设计采用用户确认的混合分层：

- Quant 负责从标准 OHLCV、逐笔和盘口事实计算数值型基础指标、K 线形态候选和微观结构原语。
- Server 负责信号目录、对象适配、资产级确认、跨数据域高级模型、质量状态、快照和页面 API。
- Web 负责统一矩阵、筛选和渐进展开，不执行业务计算。

## Goals

- 以一套版本化目录生成 140 个稳定信号，避免页面、API 和研究脚本各自命名。
- 日线信号每日收盘后幂等快照，列表只读取摘要，详情按需读取完整结果。
- 所有结果保留业务时间、计算时间、来源和版本，相同输入可复现。
- 不可用和不适用状态进入正常契约，不以零值、中性值或伪触发替代。
- 当前可计算信号真实运行；缺失的 Level 2、CFTC、实际利率、黄金 ETF 和黄金期权能力明确列为未来数据域。

## V1 Active Scope

140 项目录全部可查询，但“出现在目录”不等于“当前可计算”。`technical-signals-1.0.0` 的 V1 运行范围固定如下：

| 层级 | 真实计算 | 仅目录与缺失状态 |
|---|---|---|
| 四对象基础信号 | 全部；黄金量能项返回 `not-applicable` | 无 |
| 四对象 K 线形态 | 全部；资产级确认按对象降级 | 无 |
| 大盘高级模型 | Risk-On/Off、宽度扩散、波动率状态、跨资产相关性、风格扩散、流动性与成交结构 | 利率与估值周期、经济周期领先指标、信用周期、HMM |
| 板块高级模型 | 动量扩散、RS 趋势、资金流、盈利周期、估值分位、龙头共振、拥挤度、多因子配置 | 成长防守轮动仅作市场背景；产业链景气为不可用 |
| 个股高级模型 | Alpha、Fama-French、质量成长、盈利修正、资金累积、波动压缩、筹码、行业 RS、事件、多因子 | 无；缺少单项输入时降低质量，不伪造完整 |
| 黄金高级模型 | 无完整宏观模型 | 实际利率、美元、金银比、CFTC、ETF、央行、商品比价、期限结构、期权和状态切换全部保留数据要求并返回 `unavailable` |
| 个股微观结构 | Amihud、CVD 近似、大单主动失衡近似、Kyle Lambda 近似、当前时点 OBI、VWAP 偏离 | OFI、VPIN、Absorption、Volume Profile、补单撤单、集合竞价失衡 |

V1 不新增 `quote_snapshot` 实时写入器、不启动全市场盘口轮询，也不把最近交易日分笔保存成完整历史。详情页可按需调用现有取数能力计算当日近似指标，并使用短 TTL 缓存；历史回放条件不足时返回数据要求。

## Non-Goals

- 本变更不实现统一胜率回测生产器；验证表先接受证据，实时状态与验证结果分离。
- 本变更不接新增外部数据源，不改变东财、腾讯、mootdx、新浪和 Yahoo 的现有优先级。
- 本变更不改变 `load_kline`、复权 PIT、回测数据源或原始行情表。
- 本变更不根据信号自动下单、调仓或生成确定性目标价。

## Alternatives

### A. Quant 全算，Server 只转发

数值公式和未来回测复用最好，但宏观、财务、估值、跨资产和对象适配都压入 Quant，Server 无法统一治理数据质量，页面契约也会被 Quant 内部结构反向约束。未采用。

### B. Server 全算，Quant 不参与

API 和 UI 组装直接，但会复制现有 Python 技术因子，并让 TypeScript 承担大面积数值计算；未来回测会与页面形成第二套公式。未采用。

### C. Quant 计算原语，Server 组合业务信号

保留 Python 数值优势，又让 Server 控制目录、对象、质量和快照。代价是需要定义跨语言契约并存储中间结果。用户已确认采用。

## Signal Catalog

### 版本与共享方式

新增 `packages/signal-catalog`：

- `catalog.json` 是信号 ID、名称、层级、对象、参数、规则说明、数据要求和显示顺序的唯一事实源。
- `src/index.ts` 提供 TypeScript 类型、校验和确定性展开函数。
- Quant 从同一 JSON 加载目录；Docker 构建显式复制该文件。
- 目录版本使用语义版本，例如 `technical-signals-1.0.0`。规则或参数发生行为变化时必须递增版本。
- 发布前校验总数为 140，所有 `signal_id` 唯一，对象与层级配额正确。

### ID 规则

`signal_id` 由 `layer.scope.name` 组成：

- `basic.market.price_vs_ma200`
- `pattern.stock.platform_breakout`
- `advanced.gold.real_yield`
- `micro.stock.ofi`

基础信号和 K 线形态模板在四个对象间复用，但展开后带对象前缀，避免跨对象同名混淆。高级模型和微观结构使用各自目录。

### 目录数量

| 层级 | 大盘 | 板块 | 个股 | 黄金 | 合计 |
|---|---:|---:|---:|---:|---:|
| 基础信号 | 10 | 10 | 10 | 10 | 40 |
| K 线形态 | 12 | 12 | 12 | 12 | 48 |
| 高级模型 | 10 | 10 | 10 | 10 | 40 |
| 微观结构 | 0 | 0 | 12 | 0 | 12 |
| 合计 | 32 | 32 | 44 | 32 | 140 |

## Object Semantics

| 对象 | 价格序列 | 计算口径 | 关键约束 |
|---|---|---|---|
| 大盘 | 上证指数 `000001.SH` 日线 | hfq 不适用指数价格；使用原始指数点位 | 基础信号和形态描述指数结构；高级模型使用全市场宽度、风格和跨资产证据 |
| 板块 | `board_kline` 板块指数日线 | 使用板块指数原始点位 | 行业与概念分开；可追加成分股宽度和龙头共振确认 |
| 个股 | `bar1d_hfq` 计算，展示可映射 qfq | 指标、形态和验证统一使用 hfq | 涨跌停与停牌作为质量门，不得把缺失交易日补成平盘 |
| 黄金 | `market_asset_daily_bar(XAUUSD)` | USD/oz 原始价格 | 无可信成交量；量能信号返回 `not-applicable` |

“大盘”不是单一指数买卖信号。界面显示“A 股市场状态”，其中基础信号和形态的市场基准价格使用上证指数，高级模型覆盖全市场状态。

## Basic Signals

| ID 后缀 | 公式或规则 | 最小数据 |
|---|---|---|
| `price_vs_ma200` | `close / MA200 - 1` | 200 根日线 |
| `ma200_slope_20` | `MA200_t / MA200_t-20 - 1` | 220 根日线 |
| `macd_zero_axis` | EMA12/26 得 DIF，EMA9 得 DEA；输出 DIF、DEA 与零轴关系 | 35 根日线 |
| `macd_divergence` | 最近两个显著低/高点，价格创新低/高而 DIF 或柱值未创新低/高 | 60 根日线 |
| `rsi_state` | RSI14 及阈值 30/70、近两次摆动背离 | 30 根日线 |
| `bollinger_regime` | `(upper-lower)/mid` 的 252 日分位；压缩与带外突破分开 | 252 根日线 |
| `rvol` | `volume / mean(volume, 20)` | 20 根有效成交量 |
| `adx_di` | Wilder ADX14、DI+、DI- | 30 根日线 |
| `obv_trend` | OBV 的 20 日斜率、价格 OBV 背离 | 20 根有效成交量 |
| `atr_regime` | `ATR14 / close` 的 252 日分位 | 252 根日线 |

黄金的 `rvol` 与 `obv_trend` 为 `not-applicable`。成交量缺失的其他对象也不得把量比设为零。

### 技术快照单一计算来源

本变更把现有个股分析 `TechnicalSnapshot` 的 MA、RSI14、ATR14、波动率、支撑/压力、区间收益和 60 日回撤字段迁入 Quant 的统一计算端点。Server 继续返回原有 `technical` 响应形状，并增加信号矩阵；不得在 TypeScript 再维护一套共享 RSI、ATR 或 MA 公式。

迁移要求：

- 使用现有测试 fixture 锁定字段和精度，API 对外字段与语义保持不变。
- Quant 返回与 `TechnicalSnapshot` 对应的兼容对象，并同时返回基础信号原语。
- Server 的对比、个股分析和风险区间读取同一结果，样本截止时间使用同一 `as_of`。
- 价格趋势图仍可继续使用 Server 返回的 `prices`；图表组件和支撑/压力展示不得改变。
- 若 Quant 技术计算不可用，技术模块返回真实错误或缺失状态，其他研报、财务和事件模块继续展示。

## K-line Patterns

形态是组合状态，底层基础信号只作为证据一次计数。所有阈值进入目录参数，版本升级后可重算，不在组件内硬编码。

| 形态 | 主条件 | 确认条件 | 失效条件 |
|---|---|---|---|
| 震荡待涨 | 20–60 日箱体、振幅收敛、收盘位于区间上 1/3 | 缩量后量能回升，MA20 走平或向上 | 跌破箱体下沿或放量向下突破 |
| 缩量筑底 | 接近 60 日低位，出现更高低点 | 5 日量能低于均值后回升，RSI 脱离弱势 | 创新低且无法收回 |
| 黄金交叉 | MA20 上穿 MA60 | MACD 转强或价格站上 MA60 | 快速跌回交叉区下方 |
| 多头排列 | MA20 > MA60 > MA120，长均线斜率向上 | 价格不破 MA20，宽度或相对强弱为正 | MA20 下穿 MA60 |
| 底部起涨 | 更高低点后突破 20 日高点 | RVOL 扩张；大盘/板块另需宽度改善 | 跌回突破起点或宽度恶化 |
| 平台突破 | 平台区间收窄后收盘突破 60 日高点 | RVOL > 参数阈值并保持收盘 | 假突破回箱体 |
| 回踩确认 | 已完成有效突破 | 缩量回踩原阻力区后重新放量站稳 | 有效跌破突破区 |
| 主升加速 | 多头排列上方运行，20 日收益位于自身历史高分位 | 回撤受控、趋势斜率上升 | 跌破 MA20/MA60 或动量快速衰减 |
| 高位滞涨 | 接近 20–60 日高位但收益斜率下降 | 量能偏高、收盘位置转弱 | 重新放量创新高 |
| 顶部反转 | 更低高点并跌破短期颈线/MA20 | 背离、宽度恶化或放量下跌 | 重新站回颈线与 MA20 |
| 死亡交叉 | MA20 下穿 MA60 | MACD 位于零轴下方或价格失守 MA60 | 快速收回交叉区 |
| 空头破位 | 跌破 60 日低点或平台下沿 | 价格位于 MA60 下方，量能或宽度恶化 | 收回破位区并站稳 |

Server 对资产追加确认：

- 大盘形态要求指数证据与 A 股宽度同步，不允许只用单根指数 K 线。
- 板块形态要求板块指数与成分股宽度或龙头共振一致。
- 个股形态使用个股 hfq 数据，并检查停牌、涨跌停和最短样本。
- 黄金形态不能使用成交量确认；只能使用波动率、区间和价格结构确认。

### 1.0.0 初始参数

所有参数写入目录，并允许后续按版本调整：

| 参数 | 默认值 |
|---|---|
| MA 窗口 | 5、10、20、30、60、120、250；长期过滤使用 200 |
| MACD | 12、26、9 |
| RSI | 14；弱势 30、强势 70 |
| Bollinger | 20 日、2 标准差；分位窗口 252 |
| RVOL | 20 日均量；突破阈值 1.5 |
| ADX/DI | 14；趋势阈值 25 |
| ATR | 14；历史分位窗口 252 |
| 摆动点 | 左右各 3 根；背离搜索窗口 60 |
| 箱体 | 20–60 根；宽度不超过 12% 或 90 日宽度的 30 分位 |
| 区间高位/低位 | 收盘位于 60 日区间上/下 15% |
| 突破缓冲 | 收盘超过边界 0.5% |
| 回踩量能 | 回踩均量不高于突破日均量的 80% |
| 主升加速 | 20 日收益自身 252 日分位不低于 80%，最大回撤不超过 8% |

可执行解释：

- “显著高点/低点”是左右各 3 根内的最高/最低点，且与邻近摆动点价差至少为 90 日 ATR 的 0.5 倍。
- “接近低位/高位”是收盘价位于最近 60 日最低–最高区间的下/上 15%。
- “动量快速衰减”是 20 日收益较前 5 日下降至少 50%，且 MA20 斜率转负。
- “箱体宽度不超过 90 日宽度的 30 分位”同时检查绝对宽度不超过 12%；两条均满足才算收敛。

任何参数调整必须改变目录版本；未通过样本外验证的参数不得写入“已验证”结果。

## Advanced Models

### 大盘

| 模型 | 计算与数据 |
|---|---|
| Risk-On/Off | 20/60 日成长价值、大小盘、周期防御相对收益的横截面分位合成 |
| 利率曲线与估值周期 | 10 年国债、信用利差与实际利率环境；数据未接入时 `unavailable` |
| 市场宽度扩散 | 上涨家数、站上 MA200 比例及 5/10 日变化 |
| 波动率状态 | 指数 20 日实现波动率、分位与变化方向 |
| 跨资产相关性 | A 股、黄金、海外权益、美元等 60 日滚动相关；只使用共同日期 |
| 经济周期领先指标 | PMI、社融、库存与盈利预期；未接入时保留数据要求 |
| 多因子风格扩散 | 六个风格指数相对上证 20/60 日超额及一致性 |
| 信用周期 | 信用利差、融资条件和违约风险；未接入时 `unavailable` |
| 流动性与成交结构 | 全市场成交额、换手、集中度和融资活跃度 |
| HMM 市场状态 | 收益、波动、成交与相关性特征训练状态模型；模型未验证时 `low-confidence/unavailable` |

### 板块

| 模型 | 计算与数据 |
|---|---|
| 成长防守轮动 | 现有创业板50/红利低波100相对强弱扩展为风格背景 |
| 行业动量扩散 | 成分股 20/60/120 日正收益比例与板块自身动量 |
| 板块 RS 趋势 | 板块/上证或沪深300比值、斜率与 60 日突破 |
| 行业资金流 | 主力、超大、大、中、小单净流入及 5 日持续性 |
| 盈利周期与修正 | 成分股盈利增速、财务变化与一致预期修正覆盖 |
| 估值分位轮动 | 板块或成分聚合 PE/PB 分位与盈利增速匹配 |
| 产业链景气传导 | 上中下游价格、订单和景气数据；未接入时 `unavailable` |
| 龙头与板块共振 | 龙头相对行业 RS、龙头上涨与成分宽度 |
| 拥挤度反转 | 成交集中、波动分位、估值分位和涨幅拥挤 |
| 多因子行业配置 | 动量、质量、估值、波动和资金的可配置权重评分 |

### 个股

| 模型 | 计算与数据 |
|---|---|
| Alpha 动量 | 个股 20/60/120 日收益减行业/市场基准 |
| Fama-French | 规模、价值、盈利与投资暴露 |
| 质量成长 | ROE/ROIC、毛利率、现金流与增长的横截面评分 |
| 盈利预期修正 | 一致预期 EPS 跨快照变化，数据不足时低置信 |
| 资金累积与派发 | OBV、量价相关、资金流和价格冲击组合 |
| 波动率压缩突破 | ATR、布林带宽和真实波动分位 |
| 筹码集中度 | 股东户数、换手、筹码峰与成本区间 |
| 行业相对强弱 | 个股/所属行业指数 RS 与排名 |
| 事件驱动 | 财报、回购、订单、政策和公告结构化事件，不把无关联新闻当事实 |
| 多因子预期收益 | 动量、质量、估值、盈利修正和风险的标准化合成 |

### 黄金

黄金目录完整保留 10 个模型。当前可运行的是基于 XAU/USD 价格和现有跨资产日线的技术代理；实际利率、DXY、白银、CFTC、黄金 ETF、央行购金、商品比价、期货期限结构和黄金期权未接入时分别返回 `unavailable`，并显示所需数据与来源状态。

### 多因子首版权重

- 板块多因子：动量 0.30、质量 0.20、估值 0.20、波动 0.15、资金 0.15。
- 个股多因子：动量 0.25、质量 0.20、估值 0.15、盈利修正 0.20、风险与流动性 0.20。
- 每个分项先转换为同一对象的横截面百分位，再按权重求和；任一分项覆盖率不足 80% 时，综合分只返回 `low-confidence` 和分项，不输出完整排名分。
- Fama-French 首版输出规模、价值、盈利和投资四个暴露分项，不输出未经样本外验证的预期收益合成值。
- 板块“成长防守轮动”在板块详情中固定为 `not-applicable`，同时引用市场级成长/防守背景，不伪造该板块独立的综合状态。

## Microstructure

| 信号 | 公式或规则 | 数据级别 |
|---|---|---|
| OFI | 买卖一档或五档订单流变化之和 | Level 2 快照 |
| CVD | 主动买入量减主动卖出量累计 | 逐笔或分笔 |
| VPIN | 等成交量桶内买卖不平衡的均值 | 逐笔或分笔 |
| Kyle Lambda | 价格变化对带方向净成交量的回归系数 | 逐笔 + 价格 |
| OBI | `(bid_depth - ask_depth) / total_depth` | Level 2 |
| Absorption | 大方向主动成交与价格变化、盘口补充的联合判断 | 逐笔 + 盘口 |
| 大单主动失衡 | `(large_buy - large_sell) / (large_buy + large_sell)` | 逐笔，阈值按流动性动态 |
| Amihud | `mean(abs(return) / amount)` | 日线 OHLCV + amount |
| Volume Profile | POC、HVN、LVN 与 70% Value Area | 分价成交量 |
| 补单与撤单 | `refill_volume / executed_volume`、撤单率 | 逐笔委托 + Level 2 |
| 集合竞价失衡 | 开盘/收盘竞价主动买入、卖出与未匹配量 | 竞价逐笔或盘口 |
| VWAP 偏离 | `(close - VWAP) / VWAP` 及日内位置 | 分钟线或逐笔 |

当前腾讯逐笔是最近交易日的约 3 秒聚合数据，不是完整 Level 2 或逐笔委托。`quote_snapshot` 结构存在但尚未有生产写入。实现必须按实际数据级别降级：

- 只有日线：Amihud 可用；其余量价能近似的项标记代理或不可用。
- 只有当前分笔：CVD、大单失衡、VWAP 偏离可为当日近似。
- 没有历史盘口：OFI、OBI、吸收、补单和撤单只能盘中观察，不得生成历史胜率。

代理边界固定如下：

| 信号 | V1 来源 | `proxy` 理由 | 缓存 |
|---|---|---|---|
| CVD | 腾讯最近交易日约 3 秒分笔，按成交价位置近似方向 | 不是交易所逐笔主动买卖分类 | 30 秒 |
| 大单主动失衡 | 上述分笔按成交额动态阈值聚合 | 大单不等于机构单 | 30 秒 |
| Kyle Lambda | 上述分笔分桶后的价格变化与带方向净成交回归 | 样本粒度为聚合分笔 | 30 秒 |
| OBI | 当前五档报价单时点深度 | 只有当前快照，没有连续历史 | 5 秒 |
| VWAP 偏离 | 分钟价量或分笔重建的当日 VWAP | 来源粒度取决于可用端点 | 30 秒 |
| Amihud | 日线 OHLCV + amount | 日线代理非流动性 | 5 分钟 |

## Quant / Server Contract

### Quant

新增批量纯计算端点，例如 `POST /api/v1/signals/evaluate`。Server 传：

- `catalog_version`
- `scope`
- 单批对象及标准 OHLCV/amount 数组
- 可选 `microstructure` 事实数组
- `as_of` 和参数版本

Quant 返回：

- 基础信号和形态候选的原始状态、值、证据和窗口
- 微观结构计算结果或数据不足原因
- 定义版本、计算时间、输入条数和输入哈希

Quant 不读取页面配置、不生成高级业务结论、不写产品快照表。单次请求限制对象数量和 bar 数，Server 按 100–200 个对象分批，设置总 deadline 与取消信号。

### Server

Server 负责：

- 从正确表读取对象序列，执行停牌、新鲜度、覆盖率和样本门禁。
- 调用 Quant 获取原语。
- 对形态应用对象级宽度、龙头或无量能确认。
- 计算依赖财务、估值、资金和跨资产数据的高级模型。
- 生成 `summary_signals`，写入快照和触发索引。
- 提供目录、摘要、详情和个股分析聚合数据。

先进模型只使用 Server 已登记的数据域；不能因为某一因子缺失而把剩余因子重新归一化后仍标记为完整。

## Persistence

新增以下响应式表；实施时通过 Drizzle 迁移生成，不修改已有行情表。

### `technical_signal_snapshot`

主键：`object_type + object_subtype + object_code + as_of + catalog_version`

字段：

- `object_type`: `market | sector | stock | gold`
- `object_subtype`: 板块使用 `industry | concept`，其他对象为空字符串
- `object_code`
- `as_of`: 业务截止日期或时间
- `computed_at`
- `catalog_version`
- `definition_hash`
- `input_hash`
- `quality`: `available | low | missing`
- `data_sources_json`
- `signals_json`: 紧凑结果数组，包含 32 或 44 项完整结果
- `summary_json`: 页面摘要、触发数量、关键信号和缺失域

### `technical_signal_trigger`

主键：`object_type + object_subtype + object_code + as_of + catalog_version + signal_id`

只写 `triggered`、`invalidated`、`low-confidence` 和 `unavailable` 的索引行，用于列表筛选和计数。`value`、`direction`、`layer`、`quality` 和证据摘要独立列。

### `technical_signal_validation`

主键：`signal_id + scope + horizon + catalog_version + validation_version`

保存样本量、胜率、盈亏比、期望收益、最大回撤、验证区间、对象范围和完成时间。本次只建立读写边界，不生成未经验证的指标。

快照保留策略首期 180 天；目录定义不复制到每行，只保存版本和哈希。历史查询必须按快照版本读取。

## Scheduling and Performance

依赖顺序：

```text
kline-1d → adj-factor ┐
boards → board-kline ├→ technical-signals
fundflow              │
market-assets         ┘
```

- 收盘后先算大盘和黄金，再算板块，最后批量算个股。
- 个股按批次调用 Quant，单批最多 200 个对象；每批 320 根日线，失败批次可独立重试。
- 列表查询只读取 `summary_json` 和索引触发行，不解析完整详情。
- 当日详情命中快照时直接返回；未命中时按需计算，不阻塞其他页面模块。
- 单个对象最大返回 44 项信号；目录接口可按 `scope/layer` 分段并设置缓存。
- 管理端观测每批对象数、耗时、失败数、低质量数和幂等命中数。

## API Design

- `GET /api/v1/technical-signals/catalog?scope=&layer=`：按版本读取目录。
- `GET /api/v1/technical-signals/:scope/:objectCode?subtype=&asOf=`：读取摘要与完整矩阵；板块必须传 `subtype=industry|concept`。
- `GET /api/v1/technical-signals/:scope/:objectCode/:signalId?subtype=&asOf=`：读取单信号证据。
- `GET /api/v1/technical-signals/stocks?symbols=`：供当前个股列表页批量补充摘要，限制股票数量。
- 行情中心聚合接口增加市场、板块和黄金摘要；个股分析接口增加 `technicalSignals` 模块。
- 所有对象代码与 `signal_id` 必须 allowlist 校验；错误返回稳定 JSON。

### 版本化响应契约

目录和结果由共享 JSON 契约生成 TypeScript 与 Python 类型，并用跨语言 fixture 校验。最小契约如下：

```ts
type SignalStatus =
  | "triggered"
  | "neutral"
  | "invalidated"
  | "low-confidence"
  | "unavailable"
  | "not-applicable";

type SignalLayer = "basic" | "pattern" | "advanced" | "micro";
type SignalScope = "market" | "sector" | "stock" | "gold";

interface SignalDefinition {
  signalId: string;
  name: string;
  layer: SignalLayer;
  scope: SignalScope;
  direction: "bullish" | "bearish" | "neutral" | "risk";
  parameters: Record<string, number | number[] | string>;
  formula: string;
  confirmation: string[];
  invalidation: string[];
  dataRequirements: string[];
  catalogVersion: string;
}

interface SignalEvidence {
  components: Array<{
    signalId: string;
    status: SignalStatus;
    value: number | string | null;
  }>;
  notes: string[];
  missingFields: string[];
}

interface SignalResult {
  signalId: string;
  scope: SignalScope;
  objectType: "market" | "sector" | "stock" | "gold";
  objectSubtype: string;
  objectCode: string;
  status: SignalStatus;
  direction: "bullish" | "bearish" | "neutral" | "risk";
  value: number | string | null;
  unit: string | null;
  quality: "available" | "low" | "missing" | "not-applicable";
  proxy: boolean;
  sampleCount: number;
  asOf: string;
  computedAt: string;
  dataSources: string[];
  evidence: SignalEvidence;
  catalogVersion: string;
  definitionHash: string;
}

interface SignalSnapshot {
  objectType: "market" | "sector" | "stock" | "gold";
  objectSubtype: string;
  objectCode: string;
  asOf: string;
  computedAt: string;
  catalogVersion: string;
  quality: "available" | "low" | "missing";
  counts: Record<SignalStatus, number>;
  summarySignalIds: string[];
  signals: SignalResult[];
}
```

规则：

- 所有时间使用 ISO 8601 字符串；日期精度只在输入本身为日线时允许使用 `YYYY-MM-DD`。
- 数字必须是有限值；缺失统一使用 `null`，禁止 `NaN` 和 `Infinity`。
- `summarySignalIds` 必须引用同一快照内的 `signalId`。
- Server 可能附加 `dataRequirements` 和展示文案，但不能改变 Quant 原语的数值与状态。

## Data Quality and States

- 状态：`triggered`、`neutral`、`invalidated`、`low-confidence`、`unavailable`、`not-applicable`。
- Server 统一产生状态；Quant 的缺失输入只返回缺失原因，不决定产品文案。
- 一个数据域失败只将该域相关信号置为不可用；其他域继续成功。
- 只有业务日期，没有真实业务时间时使用日期并明确精度。
- 黄金量能信号固定 `not-applicable`，不是 `unavailable`。
- `generated_at` 不替代 `as_of`。
- 任何代理值必须在信号定义和结果中显式标记 `proxy=true` 及代理理由。

## Validation Boundary

- 实时状态与验证证据分开。列表和详情只显示实时状态；验证结果通过独立接口读取。
- 没有验证行时固定显示“待验证”。
- 后续回测统一使用 hfq、实际可执行价格、交易成本、5/20/60 日窗口和样本外划分。
- 同一个信号连续多日触发时按交易事件合并，避免把重叠样本当成独立样本。
- 第一版不把“研究优先级”翻译成胜率。

## Visual Design

视觉门禁在技术设计评审通过后执行。探索稿以用户指定的线上 `/home/market` 页面为唯一视觉基准，不覆盖历史原稿：

- `docs/design/prototypes/explorations/live-market-signals-v1.html`
- `docs/design/prototypes/explorations/live-stock-analysis-signals-v1.html`
- `docs/design/prototypes/explorations/screenshots/live-latest-signal-integration-v1/`

必须覆盖：

- 总览市场状态摘要与展开；
- 板块列表摘要、板块详情 32 项矩阵；
- 个股列表筛选、快速详情标签；
- 个股分析 44 项分组、证据展开、低置信和不可用；
- 黄金 32 项与无量能状态；
- 加载、空、错误、部分成功、成功；
- 1440×900 与 390×844，浅色与深色；
- 键盘筛选、展开、焦点和 reduced motion。

信息层级约束：

- 总览中的成长/红利低波、A 股宏观状态和 10 个高级模型必须位于同一个模块；成长/红利低波只作为风格轮动证据，不再独立重复。
- 板块详情、个股分析和黄金详情各使用一个技术诊断卡，通过基础/形态/高级（个股另含微观）层签切换；一个筛选器作用于当前层，不连续堆叠多个同构面板。
- 板块和个股列表只在既有表格中增加一列摘要，不复制完整矩阵。
- 板块详情的阶段、排名变化并入板块概览，不再保留内容稀疏的第二个摘要卡。
- 个股分析将情景预测和风险参考区间合并；价格图不重复展示技术诊断已有的数值行，普通“可用”状态只在全局质量条展示。

用户确认视觉稿之前，`tasks.md` 只允许包含视觉设计门禁。

## Risks / Trade-offs

- **140 项过大导致页面噪声** → 摘要只显示触发数、关键信号和完整度；详情按层分组并支持筛选，不渲染 140 张大卡。
- **技术快照迁移回归** → Quant 成为技术指标单一计算来源，Server 保持原 API 形状；用现有 fixture、API 契约测试和风险区间回归锁定迁移前后字段一致。出现不可接受的差异时停止切换，不以 TypeScript 第二套公式兜底。
- **全市场日算量过大** → 批量 Quant、每批 200 对象、列表只读摘要、完整结果按需读取，并设 deadline。
- **数据缺失被误读为中性** → 强制区分 `unavailable`、`not-applicable` 与 `neutral`。
- **黄金目录看似完整但多数宏观数据缺失** → 每项显示数据要求，黄金页区分“技术可用”和“宏观待接入”。
- **盘口表结构存在但无写入** → 不把 schema 当数据能力；微观信号按实际采样能力降级。
- **历史规则漂移** → 快照保存目录版本与哈希，历史读取不静默套用新规则。
- **前端请求瀑布** → 页面聚合只补摘要，详情单请求；个股列表批量读取本页摘要。

## Migration and Rollback

1. 新增目录包、数据库表、Quant 端点和 Server 内部服务，不切换页面。
2. 启用后台快照 Worker，只写市场、板块和少量测试股票。
3. 用同一输入校验 Quant/Server 契约和快照幂等。
4. 通过特性开关逐个启用行情中心摘要、详情、个股分析和黄金页。
5. 如有异常，关闭 `technicalSignalMatrix` 特性开关并停止 Worker；新增表保留，现有页面恢复原行为。
6. 数据库迁移只新增表与索引；回滚应用不删除已有信号快照，保证证据可追溯。

## Open Questions

无。缺失数据不阻塞目录和可用信号上线；视觉方案在门禁阶段由用户确认。
