"""
统一数据返回模型（Pydantic）。

字段命名对齐 server 端数据库表结构（snake_case），保证各数据源取回的数据
可直接映射到 `bar1d_adj` / `bar1m_adj` / `quote_latest` 等表做落库，
而无需在 provider 之间再转一遍字段名。

- `KlineBar`   对齐 bar1d_adj / bar1m_adj（time/open/high/low/close/volume/amount）
- `Quote`      对齐 quote_latest（last/pre_close/change/change_pct/pe/pb/limit_up/down/五档…）
- `TradeTick`  逐笔成交（mootdx transaction）
- `AdjustFactor` 复权因子（新浪 qfq/hfq）
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class BidAskLevel(BaseModel):
    """五档盘口的一档。"""

    price: float
    volume: float


class KlineBar(BaseModel):
    """一根 K 线，对齐 bar1d_adj / bar1m_adj 核心列。"""

    time: str  # YYYY-MM-DD（或含时分秒，取前 10 位归一）
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: float | None = None
    ma5: float | None = None
    ma10: float | None = None
    ma20: float | None = None
    # 复权因子（应用新浪复权后回填，未复权时为 None）
    adj_factor: float | None = None


class Quote(BaseModel):
    """单只标的实时行情，对齐 quote_latest 核心列 + 五档 + 长尾 extra。"""

    symbol: str
    name: str | None = None
    last: float | None = None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    pre_close: float | None = None
    volume: float | None = None
    amount: float | None = None
    change: float | None = None
    change_pct: float | None = None
    turnover_rate: float | None = None
    pe: float | None = None
    pb: float | None = None
    limit_up: float | None = None
    limit_down: float | None = None
    # 盘口五档（腾讯不提供，mootdx 提供）
    bid: list[BidAskLevel] = Field(default_factory=list)
    ask: list[BidAskLevel] = Field(default_factory=list)
    # 僵尸报价检测（北交所老号段 / 长期停牌股）
    is_stale: bool = False
    stale_reason: str | None = None
    # 长尾字段兜底（量比 / 振幅 / 流通市值 / 总市值 / 静态PE 等）
    extra: dict = Field(default_factory=dict)


class TradeTick(BaseModel):
    """逐笔成交。"""

    time: str
    price: float
    volume: float
    num: int | None = None
    # buy / sell / neutral
    side: str = "neutral"


class AdjustFactor(BaseModel):
    """复权因子序列的一条。"""

    date: str
    factor: float


# ============================================================================
# 信号层（Layer 3）模型 — 同花顺热点 / 北向 / 概念归属 / 资金流 / 龙虎榜 / 解禁 / 板块
# ============================================================================


class HotReasonItem(BaseModel):
    """同花顺当日强势股 + 题材归因（reason 为核心字段）。"""

    code: str
    name: str = ""
    reason: str = ""  # 题材归因 tags，如「算力租赁+Token工厂+AI政务」
    close: float | None = None
    change: float | None = None  # 涨跌额（元）
    change_pct: float | None = None  # 涨幅(%)
    turnover_rate: float | None = None  # 换手率(%)
    amount: float | None = None  # 成交额（元）
    volume: float | None = None  # 成交量（股）
    large_order_net: float | None = None  # 大单净量（主力净流入指标）
    market: str = ""  # 沪/深/北


class NorthboundPoint(BaseModel):
    """沪深股通当日实时分钟流向的一个时间点。单位：亿元。"""

    time: str
    hgt_yi: float | None = None  # 沪股通累计净买入
    sgt_yi: float | None = None  # 深股通累计净买入


class ConceptBlock(BaseModel):
    """个股所属的单个板块 / 概念。"""

    name: str = ""
    code: str = ""  # BK 板块代码
    change_pct: float | None = None  # 板块当日涨跌幅
    lead_stock: str = ""  # 板块龙头股


class ConceptBlocks(BaseModel):
    """个股所属板块/概念归属（东财 slist）。"""

    total: int = 0
    boards: list[ConceptBlock] = Field(default_factory=list)
    concept_tags: list[str] = Field(default_factory=list)


class FundFlowPoint(BaseModel):
    """个股资金流分钟级一个点。单位：元。"""

    time: str
    main_net: float = 0.0  # 主力净流入
    small_net: float = 0.0  # 小单净流入
    mid_net: float = 0.0  # 中单净流入
    large_net: float = 0.0  # 大单净流入
    super_net: float = 0.0  # 超大单净流入


class FundFlowDay(BaseModel):
    """个股资金流日级一条。单位：元。"""

    date: str
    main_net: float = 0.0
    small_net: float = 0.0
    mid_net: float = 0.0
    large_net: float = 0.0
    super_net: float = 0.0
    close: float | None = None  # 当日收盘价
    change_pct: float | None = None  # 当日涨跌幅(%)


class DragonTigerSeat(BaseModel):
    """龙虎榜单边（买/卖）席位。单位：万元。"""

    name: str = ""
    buy_amt: float = 0.0
    sell_amt: float = 0.0
    net: float = 0.0


class DragonTigerRecord(BaseModel):
    """龙虎榜上榜记录。"""

    date: str = ""
    reason: str = ""  # 上榜原因
    net_buy: float = 0.0  # 净买入（万元）
    turnover: float = 0.0  # 换手率(%)


class DragonTigerInstitution(BaseModel):
    """龙虎榜机构专用席位买卖统计。单位：万元。"""

    buy_amt: float = 0.0
    sell_amt: float = 0.0
    net_amt: float = 0.0


class DragonTigerSeats(BaseModel):
    """买卖席位 TOP5。"""

    buy: list[DragonTigerSeat] = Field(default_factory=list)
    sell: list[DragonTigerSeat] = Field(default_factory=list)


class DragonTigerBoard(BaseModel):
    """个股龙虎榜聚合结果。"""

    records: list[DragonTigerRecord] = Field(default_factory=list)
    seats: DragonTigerSeats = Field(default_factory=DragonTigerSeats)
    institution: DragonTigerInstitution = Field(default_factory=DragonTigerInstitution)


class LockupExpiryItem(BaseModel):
    """限售解禁一批。shares/able_shares 单位：万股。"""

    date: str = ""
    type: str = ""  # 解禁类型
    shares: float = 0.0  # 本次解禁股数
    able_shares: float = 0.0  # 实际可流通股数
    ratio: float = 0.0  # 占总股本比（小数，×100 得百分比）


class LockupExpiry(BaseModel):
    """限售解禁日历（历史 + 未来）。"""

    history: list[LockupExpiryItem] = Field(default_factory=list)
    upcoming: list[LockupExpiryItem] = Field(default_factory=list)


class IndustryRankItem(BaseModel):
    """行业板块排名一条。"""

    rank: int = 0
    name: str = ""
    code: str = ""
    change_pct: float | None = None  # 涨跌幅(%)
    up_count: int = 0  # 上涨家数
    down_count: int = 0  # 下跌家数
    leader: str = ""  # 领涨股
    leader_change: float | None = None  # 领涨股涨跌幅


class IndustryComparison(BaseModel):
    """全行业涨跌幅排名。"""

    top: list[IndustryRankItem] = Field(default_factory=list)
    bottom: list[IndustryRankItem] = Field(default_factory=list)
    total: int = 0


class BoardFundFlowItem(BaseModel):
    """板块资金流向一条。金额单位：元，净占比单位：%。"""

    rank: int = 0
    name: str = ""
    code: str = ""
    change_pct: float | None = None
    main_net: float | None = None  # 主力净流入
    main_pct: float | None = None  # 主力净占比(%)
    leader: str = ""
    # 仅今日周期：超大/大/中/小单净额
    super_large_net: float | None = None
    large_net: float | None = None
    medium_net: float | None = None
    small_net: float | None = None
    # 主力净流入最大股（仅今日周期，f204 代码 / f205 名称）
    top_stock_code: str = ""
    top_stock_name: str = ""


class BoardFundFlow(BaseModel):
    """板块资金流向排名结果。"""

    board_type: str = ""  # industry / concept / region
    period: str = ""  # today / 5d / 10d
    total: int = 0
    rows: list[BoardFundFlowItem] = Field(default_factory=list)


class FundFlowRankItem(BaseModel):
    """个股资金流排行一条。金额单位：元，净占比单位：%。"""

    code: str = ""
    name: str = ""
    price: float | None = None  # 最新价
    change_pct: float | None = None  # 涨跌幅(%)
    main_net: float | None = None  # 主力净流入
    main_pct: float | None = None  # 主力净占比(%)
    super_large_net: float | None = None  # 超大单净流入
    large_net: float | None = None  # 大单净流入
    medium_net: float | None = None  # 中单净流入
    small_net: float | None = None  # 小单净流入


class BoardListItem(BaseModel):
    """板块列表一条（行业/概念），供热力图一级节点使用。"""

    name: str = ""
    code: str = ""  # BK 板块代码，如 BK0475
    change_pct: float | None = None  # 涨跌幅(%)
    total_market_cap: float | None = None  # 总市值（元）
    turnover_rate: float | None = None  # 换手率(%)
    leader: str = ""  # 领涨股名称
    leader_change: float | None = None  # 领涨股涨跌幅(%)


class BoardList(BaseModel):
    """板块列表（行业/概念）。"""

    board_type: str = ""  # industry / concept
    total: int = 0
    rows: list[BoardListItem] = Field(default_factory=list)


class BoardConstituentItem(BaseModel):
    """板块成分股一条，供热力图二级节点使用。"""

    code: str = ""  # 6 位股票代码
    name: str = ""
    price: float | None = None  # 最新价
    change_pct: float | None = None  # 涨跌幅(%)
    turnover_rate: float | None = None  # 换手率(%)
    amount: float | None = None  # 成交额（元）


class DailyDragonTigerStock(BaseModel):
    """全市场龙虎榜中的一只股票。金额单位：万元。"""

    code: str = ""
    name: str = ""
    reason: str = ""
    close: float = 0.0
    change_pct: float = 0.0
    net_buy_wan: float = 0.0
    buy_wan: float = 0.0
    sell_wan: float = 0.0
    turnover_pct: float = 0.0


class DailyDragonTiger(BaseModel):
    """全市场龙虎榜汇总。"""

    date: str = ""
    total_records: int = 0
    stocks: list[DailyDragonTigerStock] = Field(default_factory=list)
    note: str | None = None


# ============================================================================
# 资金面 / 筹码层（Layer 4）模型 — 融资融券 / 大宗 / 股东户数 / 分红 / 资金流120日 / 筹码
# ============================================================================


class MarginTradingItem(BaseModel):
    """融资融券明细一条。金额单位：元。"""

    date: str = ""
    rzye: float = 0.0  # 融资余额
    rzmre: float = 0.0  # 融资买入额
    rzche: float = 0.0  # 融资偿还额
    rqye: float = 0.0  # 融券余额
    rqmcl: float = 0.0  # 融券卖出量
    rqchl: float = 0.0  # 融券偿还量
    rzrqye: float = 0.0  # 融资融券余额合计


class BlockTradeItem(BaseModel):
    """大宗交易一条。"""

    date: str = ""
    price: float = 0.0  # 成交价
    close: float = 0.0  # 当日收盘价
    premium_pct: float = 0.0  # 溢价率(%)
    vol: float = 0.0  # 成交量
    amount: float = 0.0  # 成交额
    buyer: str = ""  # 买方营业部
    seller: str = ""  # 卖方营业部


class HolderNumItem(BaseModel):
    """股东户数变化一条。"""

    date: str = ""
    holder_num: float = 0.0  # 股东户数
    change_num: float = 0.0  # 户数变化
    change_ratio: float = 0.0  # 环比(%)
    avg_shares: float = 0.0  # 户均持股


class DividendItem(BaseModel):
    """分红送转历史一条。"""

    date: str = ""  # 除权除息日
    bonus_rmb: float = 0.0  # 每股派息（税前，元）
    transfer_ratio: float = 0.0  # 每10股转增
    bonus_ratio: float = 0.0  # 每10股送股
    plan: str = ""  # 进度


class ChipDistribution(BaseModel):
    """筹码分布（本地推演）结果。"""

    price: float  # 现价
    profit_ratio: float  # 获利比例（现价之下持仓占比，[0,1]）
    avg_cost: float  # 平均成本
    cost_90: tuple[float, float]  # 5%~95% 分位价格区间
    cost_70: tuple[float, float]  # 15%~85% 分位价格区间
    concentration_90: float | None = None  # 90% 集中度
    concentration_70: float | None = None  # 70% 集中度
    peak_price: float  # 筹码峰
    histogram: list[tuple[float, float]] = Field(default_factory=list)  # (价位, 权重)
