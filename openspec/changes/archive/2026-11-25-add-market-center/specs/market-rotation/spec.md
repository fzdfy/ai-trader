# Spec Delta

## Purpose

把成长/防守、行业、概念和大类资产轮动嵌入对应资产与板块上下文，让用户从当前对象直接观察相对强弱、排名变化和资金确认，而不是在独立轮动页重复另一套行情数据。

## ADDED Requirements

### Requirement: Rotation is contextual rather than a separate top-level module

行情中心 SHALL 保持“总览、板块、个股”三个一级模块，轮动信息 MUST 嵌入总览或板块上下文，不得增加独立轮动模块或二级轮动 Tab。

#### Scenario: User opens market center

- **WHEN** 用户进入行情中心
- **THEN** 一级模块 MUST 仍为“总览、板块、个股”
- **AND** 用户 MUST 能从总览进入成长/防守和大类资产轮动
- **AND** 用户 MUST 能从板块进入行业或概念轮动

### Requirement: Growth and defense rotation is visible in the overview

行情中心总览 SHALL 展示“成长 / 防守轮动”，以创业板50和红利低波100的相对强弱表达成长占优、中性或防守占优，不得使用泛化的“风格轮动”名称。

#### Scenario: Growth and defense data is available

- **WHEN** 两类指数的最新日线和历史序列可用
- **THEN** 总览 MUST 展示当前比值、数据日期、相对强弱状态和趋势
- **AND** 方法说明 MUST 明确比较对象与信号时点
- **AND** 页面 MUST NOT 将该状态描述为保证收益的买卖建议

#### Scenario: Growth and defense data is unavailable

- **WHEN** 任一指数或必要历史序列不可用
- **THEN** 轮动区域 MUST 显示真实缺失或过期状态
- **AND** 总览中的其他资产和市场模块 MUST 继续展示

### Requirement: Cross-asset rotation is visible in the overview

大类资产轮动 SHALL 位于总览的独立区域并使用独立切换器，不得与“主要指数”的行情/相对大盘模式混排，也不得把不完整资产集合描述为覆盖全部股票、债券、商品和现金。

#### Scenario: User compares cross-asset strength

- **WHEN** 固定资产的同期日线可用
- **THEN** 总览 MUST 展示资产名称、相对强弱排序、统计窗口和数据日期
- **AND** 一期资产集合 MUST 明确标注为 A股宽基、A股成长、黄金和海外权益

#### Scenario: One cross-asset series is missing

- **WHEN** 任一大类资产缺少同期数据
- **THEN** 该资产 MUST 从相对强弱排名中排除并显示缺失原因
- **AND** 其他资产排名 MUST 继续展示

### Requirement: Main index rotation uses the Shanghai benchmark

主要指数的相对大盘视图 SHALL 把上证指数作为共同基准，在七个指数共同交易日上计算六个风格指数的区间百分点超额收益。

#### Scenario: Main index excess return is calculated

- **WHEN** 上证指数和至少 4 个风格指数拥有共同交易日
- **THEN** 每个有效风格指数 MUST 使用“自身区间涨跌幅减上证区间涨跌幅”计算超额收益
- **AND** 结果 MUST 使用百分点表示
- **AND** 六项 MUST 按超额收益从高到低排名

#### Scenario: Main index history is insufficient

- **WHEN** 必要窗口历史不足、共同交易日缺失或有效风格指数少于 4 个
- **THEN** 系统 MUST 标记样本不足
- **AND** 系统 MUST NOT 使用短窗口、ETF 或跨市场资产补位

#### Scenario: Growth-defense signal remains separate

- **WHEN** 页面同时展示主要指数相对大盘和成长/防守轮动
- **THEN** 两组结果 MUST 使用各自明示的方法与数据日期
- **AND** 系统 MUST NOT 复用同一排名名称或把两者描述为同一指标

### Requirement: Industry and concept rotation live inside the boards module

板块模块 SHALL 在行业和概念分类内直接展示轮动区域，行业轮动和概念轮动 MUST 分别使用对应板块数据，不得增加轮动二级 Tab。

#### Scenario: User reviews industry rotation

- **WHEN** 用户查看行业板块页的轮动区域
- **THEN** 系统 MUST 展示行业的相对收益、5/20/60 日排名变化和资金确认信息
- **AND** 5/20/60 日窗口切换 MUST 位于行业轮动卡片标题栏，不得放在页面级板块筛选区
- **AND** 左侧象限摘要 MUST 使用四个纵向行，并铺满轮动内容区的高度和宽度
- **AND** 每个象限行 MUST 按当前排名顺序展示前 3 个可用板块及其排名、排名变化和主力确认
- **AND** 象限内板块条目默认 MUST 使用透明背景，仅在悬停或键盘聚焦时显示背景
- **AND** 同象限不足 3 个可用板块时 MUST 只展示真实可用项
- **AND** 用户选择行业 MUST 打开该行业的板块详情页
- **AND** 轮动列表 MUST NOT 在下方重复展示单个板块的详情卡

#### Scenario: User reviews concept rotation

- **WHEN** 用户查看概念板块页的轮动区域
- **THEN** 系统 MUST 展示概念的相对收益、排名变化、资金集中度和涨停集中度中可用的指标
- **AND** 5/20/60 日窗口切换 MUST 位于概念轮动卡片标题栏，不得放在页面级板块筛选区
- **AND** 左侧象限摘要 MUST 使用四个纵向行，并铺满轮动内容区的高度和宽度
- **AND** 每个象限行 MUST 按当前排名顺序展示前 3 个可用概念及其排名、排名变化和主力确认
- **AND** 象限内概念条目默认 MUST 使用透明背景，仅在悬停或键盘聚焦时显示背景
- **AND** 同象限不足 3 个可用概念时 MUST 只展示真实可用项
- **AND** 概念轮动 MUST NOT 复用行业板块的数据或口径
- **AND** 用户选择概念 MUST 打开该概念的板块详情页

#### Scenario: Rotation history is insufficient

- **WHEN** 任一板块缺少形成轮动判断所需的历史窗口
- **THEN** 该板块 MUST 标记数据不足
- **AND** 系统 MUST NOT 用短窗口近似冒充完整轮动结果

### Requirement: Board anomaly mode and detail funds validate rotation

板块页的同屏异动区域与板块/个股详情 SHALL 提供资金和规则异动证据，用于验证轮动是否得到主力资金确认，不得在轮动列表中复制完整资金结构。

#### Scenario: User validates a rotation

- **WHEN** 用户从轮动视图查看资金确认
- **THEN** 系统 MUST 定位到对应板块页的异动区域或详情资金结构
- **AND** 证据 MUST 保留行业或概念上下文和快照日期

#### Scenario: Rotation and capital evidence diverge

- **WHEN** 相对强弱改善但资金流或市场结构不支持
- **THEN** 系统 MUST 允许同时展示两类证据
- **AND** 系统 MUST NOT 自动生成确定性买卖结论
