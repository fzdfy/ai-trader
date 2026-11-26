# Spec Delta

## Purpose

行情中心是市场情报的发现与明细工作区，统一承载总览、板块和个股，让用户从每日看板摘要继续下钻，同时避免复制每日决策摘要和个股深度研究能力。

## ADDED Requirements

### Requirement: Market center provides three fixed MVP modules

行情中心 SHALL 提供“总览、板块、个股”三个固定模块，并通过一致的模块导航在模块之间切换。

#### Scenario: User opens market center

- **WHEN** 用户进入 `/home/market`
- **THEN** 系统 MUST 默认展示“总览”
- **AND** 用户 MUST 能切换到“板块”“个股”
- **AND** 当前模块 MUST 具有可见且可访问的选中状态

#### Scenario: User switches modules with keyboard

- **WHEN** 模块导航获得键盘焦点且用户使用方向键
- **THEN** 系统 MUST 按确定性顺序移动模块焦点
- **AND** 用户 MUST 能使用 Enter 或 Space 打开目标模块

### Requirement: Market overview summarizes market discovery state

行情中心总览 SHALL 展示主要指数、独立大类资产轮动、市场广度、涨跌停概况和数据新鲜度，不得复制每日看板的今日任务、工作流、资讯、复盘或每日选股。

#### Scenario: Overview data is available

- **WHEN** 主要指数行情与市场快照可用
- **THEN** 总览 MUST 展示主要指数的最新状态、市场广度和涨跌停概况
- **AND** 每个数据域 MUST 显示对应快照日期或数据时间
- **AND** 用户 MUST 能从总览下钻到板块或个股模块

#### Scenario: Overview market data is stale

- **WHEN** 任一总览数据域早于其可信时间窗口
- **THEN** 系统 MUST 标记该数据域为陈旧或低质量
- **AND** 系统 MUST NOT 把旧快照描述为实时数据

### Requirement: Main indices define the A-share market structure view

“主要指数”卡 SHALL 固定展示上证指数、沪深300、中证500、中证1000、创业板50、科创50和中证红利低波100，不得混入 ETF、黄金或海外指数。

#### Scenario: User opens the main indices card

- **WHEN** 用户进入行情中心总览
- **THEN** 页面 MUST 显示标题“主要指数”
- **AND** 上证指数 MUST 独占第一行并标记为“市场基准”
- **AND** 其余六项 MUST 按沪深300、中证500、中证1000、创业板50、科创50、中证红利低波100的顺序展示
- **AND** 六项 MUST 分别显示“大盘核心”“中盘成长”“小盘成长”“成长进攻”“科技成长”“防御价值”角色标签

#### Scenario: Desktop and mobile layout

- **WHEN** 页面宽度为桌面 `1440×900`
- **THEN** 六项 MUST 以 `3 × 2` 排列
- **WHEN** 页面宽度为移动端 `390×844`
- **THEN** 六项 MUST 以 `2 × 3` 排列
- **AND** 上证指数 MUST 在两种视口中保持独立全宽行

### Requirement: Main index quote mode preserves per-index freshness

主要指数的行情模式 SHALL 逐项展示当前点位、涨跌幅、来源和业务日期，不得用单一卡片时间替代不同资产的真实快照时间。

#### Scenario: Mixed live and official close data

- **WHEN** 部分指数提供实时报价且 `930955.CSI` 仅提供官方收盘
- **THEN** 每项 MUST 显示自身来源和日期或时间
- **AND** 卡片 MUST NOT 把整个集合描述为同一实时快照
- **AND** 缺失指数 MUST 保留固定位置并显示真实缺失状态

#### Scenario: Index quote is stale

- **WHEN** 某项行情超过其可信时间窗口
- **THEN** 该项 MUST 标记为陈旧或低质量
- **AND** 其他可用指数 MUST 继续展示

### Requirement: Main index relative strength uses the Shanghai benchmark

主要指数的相对大盘模式 SHALL 使用六个风格指数相对上证指数的区间百分点超额收益，并按超额收益从高到低排名。

#### Scenario: User compares the six style indices

- **WHEN** 用户选择“相对大盘”
- **THEN** 页面 MUST 支持 `5日`、`20日`、`60日`窗口并默认 `20日`
- **AND** 上证指数 MUST 固定显示为市场基准并展示自身区间涨跌幅
- **AND** 六项 MUST 显示相对上证指数的百分点超额收益及排名

#### Scenario: Relative strength uses a common trading date

- **WHEN** 系统计算相对大盘结果
- **THEN** 七个指数 MUST 使用共同拥有的最近交易日
- **AND** 页面 MUST 显示该共同交易日
- **AND** 系统 MUST NOT 用前一交易日或其他指数替代缺失值

#### Scenario: Style index sample is sufficient

- **WHEN** 上证指数及至少 4 个风格指数在共同交易日拥有有效收盘
- **THEN** 系统 MUST 生成六项中有效指数的超额收益排名
- **AND** 缺失指数 MUST 保留固定位置且不参与排名

#### Scenario: Style index sample is insufficient

- **WHEN** 有效风格指数少于 4 个或没有共同交易日
- **THEN** 系统 MUST 显示“样本不足”或“数据不可用”
- **AND** 系统 MUST 展示仍然可用的指数行情
- **AND** 系统 MUST NOT 生成排名

### Requirement: Boards module supports discovery and drill-down

板块模块 SHALL 支持行业与概念切换，并在同一页面直接展示当前排行、热力图、轮动和异动，不得为轮动或异动增加二级 Tab。

#### Scenario: User reviews board rankings

- **WHEN** 用户打开板块模块
- **THEN** 系统 MUST 支持“行业”和“概念”切换
- **AND** 页面 MUST 同时摆出当前排行、热力图、轮动和异动
- **AND** 轮动和异动 MUST NOT 作为二级 Tab 隐藏
- **AND** 板块列表 MUST 展示名称、涨跌幅、换手或量价信息以及可用资金流指标
- **AND** 用户 MUST 能排序或分页浏览完整结果
- **AND** 板块页热力图 MUST 展示按总市值选出的前 20 个唯一板块
- **AND** 热力图 MUST 使用共享行列轨道的对齐网格，按市值排名映射 `2×2`、`2×1`、`1×2`、`1×1` 跨格
- **AND** 热力图颜色 MUST 使用以 `0%` 灰色为中心、每 `1%` 一档的离散涨跌幅色阶，不得在档位内连续插值：
  `≤-3%`、`-3–-2%`、`-2–-1%`、`-1–0%`、`0%`、`0–1%`、`1–2%`、`2–3%`、`≥3%`
- **AND** 只有 `≥3%` MUST 使用完整深红、`≤-3%` MUST 使用完整深绿；其余非零档位 MUST 使用 `25%`、`50%`、`75%` 的语义色混合
- **AND** 图例 MUST 使用彩色圆点加中性色范围文字表达颜色映射，不得把每个范围渲染成整块彩色按钮
- **AND** 行情中心内容区 MUST 使用工作区可用宽度，不得限制为 `1480px`

#### Scenario: Board ranking pages use numeric rank order

- **WHEN** 用户翻页浏览行业或概念板块排行
- **THEN** 排名 MUST 按 `1, 2, 3 ...` 的数值顺序展示
- **AND** 系统 MUST NOT 按文本字典序展示为 `1, 10, 100 ...`
- **AND** 最后一页 MUST 展示真实末位板块及其实际涨跌方向

#### Scenario: User drills into a board

- **WHEN** 用户选择一个有成分股数据的板块
- **THEN** 系统 MUST 打开该板块的完整详情页
- **AND** 详情页 MUST 展示板块行情、资金、轮动信息和成分股
- **AND** 用户 MUST 能从成分股进入对应的个股行情详情

#### Scenario: Board constituents are unavailable

- **WHEN** 板块成分股数据缺失或上游失败
- **THEN** 板块模块 MUST 保留已可用的板块排行和资金信息
- **AND** 下钻区域 MUST 显示明确的空状态或错误状态

### Requirement: Stocks module supports search watchlist and quote discovery

个股模块 SHALL 支持按代码或名称搜索 A 股、管理当前用户自选股、浏览全市场行情结果，并进入单只股票的快速行情详情。

#### Scenario: User searches for a stock

- **WHEN** 用户输入代码或名称并提交搜索
- **THEN** 系统 MUST 展示匹配的 A 股结果
- **AND** 无匹配结果时 MUST 显示明确空状态

#### Scenario: User reviews watchlist

- **WHEN** 用户切换到自选
- **THEN** 系统 MUST 只展示当前用户的自选股票及可用行情
- **AND** 自选为空时 MUST 提供进入股票搜索或板块发现的入口

#### Scenario: User opens a stock from quotes

- **WHEN** 用户选择一只股票
- **THEN** 系统 MUST 打开该股票的快速行情详情
- **AND** 快速行情详情 MUST 提供进入同一标的“个股分析”的入口
- **AND** 行情列表 MUST NOT 在右侧或下方内嵌一份重复的快速详情

### Requirement: Board anomaly mode and details expose traceable capital evidence

板块页同屏异动区域 SHALL 展示行业或概念的规则型异动，板块详情和个股详情 SHALL 展示对应资金结构；异动和资金指标 MUST 保留口径与快照时间，不得生成无法解释的推荐。

#### Scenario: User reviews board anomalies

- **WHEN** 用户在行业或概念分类查看同屏异动区域
- **THEN** 列表 MUST 展示触发规则、相关指标和数据时间
- **AND** 用户 MUST 能从异动进入对应板块详情
- **AND** 没有满足规则的结果时 MUST 显示真实空状态

#### Scenario: User reviews capital in a board detail

- **WHEN** 用户打开板块详情
- **THEN** 页面 MUST 展示主力净流入以及可用的超大单、大单、中单和小单结构
- **AND** 页面 MUST 区分“资金结构”和“主力净流入”术语

#### Scenario: User reviews capital in a stock detail

- **WHEN** 用户打开个股快速行情详情
- **THEN** 页面 MUST 展示该股票的可用资金结构和异动证据
- **AND** 系统 MUST NOT 将主力净流入描述为全部资金或真实机构资金

### Requirement: Daily dashboard remains a decision summary

每日看板 SHALL 继续展示当日决策所需的市场摘要，但 SHALL NOT 复制行情中心的全市场浏览、排序、筛选、分页和完整下钻能力。

#### Scenario: User reads a dashboard market summary

- **WHEN** 用户查看每日看板的市场主线、市场温度或行情雷达
- **THEN** 系统 MUST 只展示决策所需的摘要和少量 Top 项
- **AND** 系统 MUST 提供进入行情中心对应明细模块的明确入口

#### Scenario: User needs full market browsing

- **WHEN** 用户需要查看完整排行、搜索、筛选或板块下钻
- **THEN** 用户 MUST 进入行情中心的对应模块
- **AND** 每日看板 MUST NOT 展开为第二套完整行情中心

### Requirement: Market center modules fail independently

行情中心 SHALL 隔离各数据域的加载和失败状态，单个数据域不可用不得清空其他已成功模块。

#### Scenario: One module request fails

- **WHEN** 总览、板块或个股中的任一数据请求失败
- **THEN** 系统 MUST 在该模块显示可理解的错误或空状态
- **AND** 其他可用模块 MUST 继续展示
- **AND** 用户 MUST 能单独重试失败模块

### Requirement: Market center preserves stable deep links

行情中心 SHALL 提供稳定可访问的模块和详情路径，信息架构调整不得使已有板块、个股、热力图或资金流深链接失效。

#### Scenario: User opens an existing market deep link

- **WHEN** 用户通过书签或页面内链接打开既有板块、个股、快速行情详情、热力图或资金流路径
- **THEN** 系统 MUST 展示对应内容，或通过明确兼容路径到达等价内容
- **AND** 页面导航 MUST 表达当前页面与行情中心的层级关系

#### Scenario: User enters stock analysis from market detail

- **WHEN** 用户从快速行情详情进入“个股分析”
- **THEN** 系统 MUST 打开同一标的的个股分析页面
- **AND** 返回链路 MUST 保留从行情中心到个股分析的上下文
