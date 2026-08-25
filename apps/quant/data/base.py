"""
统一数据源接口协议（Provider 抽象基类）。

每个数据源 provider 继承 `MarketProvider`，按自身能力实现对应方法，
并在 `capabilities` 中声明支持哪些能力。registry 依据能力集合做数据源
选择与降级，调用方（router）只面向本协议编程，从而「切换 / 增删数据源」时
无需改动上层代码。

当前能力（capability，均为行情层）：
- kline           K 线（多周期）
- quote           实时行情（价格 / PE / PB / 市值 / 五档 …）
- transaction     逐笔成交
- adjust_factor   复权因子（qfq / hfq）

扩展方式：新增一类数据（如资金流 / 板块 / 研报）时，在此处追加能力常量、
在基类增加对应方法签名，再为支持该能力的平台实现方法并在 registry 登记，
即可自动进入统一降级链，无需改动 router 上层。
"""
from __future__ import annotations

from abc import ABC
from typing import ClassVar

from .schemas import (
    AdjustFactor,
    BlockTradeItem,
    BoardConstituentItem,
    BoardFundFlow,
    BoardList,
    ChipDistribution,
    ConceptBlocks,
    DailyDragonTiger,
    DividendItem,
    DragonTigerBoard,
    FundFlowDay,
    FundFlowPoint,
    FundFlowRankItem,
    HolderNumItem,
    HotReasonItem,
    IndustryComparison,
    KlineBar,
    LimitUpPoolItem,
    LockupExpiry,
    MarginTradingItem,
    NorthboundPoint,
    Quote,
    TradeTick,
)

# 能力常量
CAPABILITY_KLINE = "kline"
CAPABILITY_QUOTE = "quote"
CAPABILITY_TRANSACTION = "transaction"
CAPABILITY_ADJUST_FACTOR = "adjust_factor"

# 信号层（Layer 3）
CAPABILITY_HOT_REASON = "hot_reason"
CAPABILITY_NORTHBOUND = "northbound"
CAPABILITY_CONCEPT_BLOCKS = "concept_blocks"
CAPABILITY_FUND_FLOW_MINUTE = "fund_flow_minute"
CAPABILITY_DRAGON_TIGER = "dragon_tiger"
CAPABILITY_LOCKUP_EXPIRY = "lockup_expiry"
CAPABILITY_INDUSTRY_COMPARISON = "industry_comparison"
CAPABILITY_BOARD_FUND_FLOW = "board_fund_flow"
CAPABILITY_DAILY_DRAGON_TIGER = "daily_dragon_tiger"
CAPABILITY_BOARD_LIST = "board_list"
CAPABILITY_BOARD_CONSTITUENTS = "board_constituents"
CAPABILITY_BOARD_KLINE = "board_kline"
CAPABILITY_FUND_FLOW_RANK = "fund_flow_rank"
CAPABILITY_LIMIT_UP_POOL = "limit_up_pool"

# 资金面 / 筹码层（Layer 4）
CAPABILITY_MARGIN_TRADING = "margin_trading"
CAPABILITY_BLOCK_TRADE = "block_trade"
CAPABILITY_HOLDER_NUM = "holder_num"
CAPABILITY_DIVIDEND_HISTORY = "dividend_history"
CAPABILITY_FUND_FLOW_120D = "fund_flow_120d"
CAPABILITY_CHIP_DISTRIBUTION = "chip_distribution"


class MarketProvider(ABC):
    """行情数据源统一接口。"""

    # 数据源名（如 mootdx / tencent / baidu / sina），registry 用它做 key
    name: ClassVar[str] = ""
    # 该源支持的能力集合
    capabilities: ClassVar[frozenset[str]] = frozenset()

    def kline(
        self,
        symbol: str,
        tf: str = "1d",
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
        adjust: str = "qfq",
    ) -> list[KlineBar]:
        """K 线。tf ∈ {1m,5m,15m,30m,60m,1d,1w,1mo}。

        adjust 复权口径（仅 tf=1d 时有效）：qfq=前复权（默认，最新价为基准）、
        hfq=后复权（历史价为基准）、none=不复权。非日线周期（分钟/周/月）仅
        mootdx 支持且均为不复权，忽略 adjust。
        """
        raise NotImplementedError(f"{self.name} 不支持 kline")

    def quote(self, symbols: list[str]) -> dict[str, Quote]:
        """批量实时行情，返回 {symbol: Quote}。"""
        raise NotImplementedError(f"{self.name} 不支持 quote")

    def transaction(self, symbol: str, date: str | None = None) -> list[TradeTick]:
        """逐笔成交。"""
        raise NotImplementedError(f"{self.name} 不支持 transaction")

    def adjust_factor(self, symbol: str, kind: str = "qfq") -> list[AdjustFactor]:
        """复权因子。kind ∈ {qfq, hfq}。"""
        raise NotImplementedError(f"{self.name} 不支持 adjust_factor")

    # ── 信号层（Layer 3）────────────────────────────────────────────

    def hot_reason(self, date: str | None = None) -> list[HotReasonItem]:
        """同花顺当日强势股 + 题材归因。"""
        raise NotImplementedError(f"{self.name} 不支持 hot_reason")

    def northbound(self) -> list[NorthboundPoint]:
        """沪深股通当日实时分钟流向。"""
        raise NotImplementedError(f"{self.name} 不支持 northbound")

    def concept_blocks(self, code: str) -> ConceptBlocks:
        """个股所属板块/概念归属（东财 slist）。"""
        raise NotImplementedError(f"{self.name} 不支持 concept_blocks")

    def fund_flow_minute(self, code: str) -> list[FundFlowPoint]:
        """个股资金流向（分钟级）。"""
        raise NotImplementedError(f"{self.name} 不支持 fund_flow_minute")

    def dragon_tiger(
        self, code: str, trade_date: str | None = None, look_back: int = 30
    ) -> DragonTigerBoard:
        """个股龙虎榜（上榜记录 + 买卖席位 + 机构动向）。"""
        raise NotImplementedError(f"{self.name} 不支持 dragon_tiger")

    def lockup_expiry(
        self, code: str, trade_date: str | None = None, forward_days: int = 90
    ) -> LockupExpiry:
        """限售解禁日历。"""
        raise NotImplementedError(f"{self.name} 不支持 lockup_expiry")

    def industry_comparison(self, top_n: int = 20) -> IndustryComparison:
        """全行业涨跌幅排名。"""
        raise NotImplementedError(f"{self.name} 不支持 industry_comparison")

    def board_fund_flow(
        self, board_type: str = "industry", period: str = "today", top_n: int = 20
    ) -> BoardFundFlow:
        """板块资金流向（行业/概念/地域 × 今日/5日/10日）。"""
        raise NotImplementedError(f"{self.name} 不支持 board_fund_flow")

    def daily_dragon_tiger(
        self, trade_date: str | None = None, min_net_buy: float | None = None
    ) -> DailyDragonTiger:
        """全市场龙虎榜。"""
        raise NotImplementedError(f"{self.name} 不支持 daily_dragon_tiger")

    def board_list(self, board_type: str = "industry") -> BoardList:
        """板块列表（行业/概念），含总市值/换手率/领涨股，供热力图一级节点。"""
        raise NotImplementedError(f"{self.name} 不支持 board_list")

    def board_constituents(self, board_code: str) -> list[BoardConstituentItem]:
        """板块成分股列表，供热力图二级节点。"""
        raise NotImplementedError(f"{self.name} 不支持 board_constituents")

    def board_kline(
        self,
        board_code: str,
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
    ) -> list[KlineBar]:
        """板块指数日 K 线（东财 BK 指数）。"""
        raise NotImplementedError(f"{self.name} 不支持 board_kline")

    def fund_flow_rank(self, indicator: str = "today") -> list[FundFlowRankItem]:
        """个股资金流排行（全市场，按主力净流入降序）。"""
        raise NotImplementedError(f"{self.name} 不支持 fund_flow_rank")

    def limit_up_pool(self, date: str | None = None) -> list[LimitUpPoolItem]:
        """当日涨停池。"""
        raise NotImplementedError(f"{self.name} 不支持 limit_up_pool")

    # ── 资金面 / 筹码层（Layer 4）───────────────────────────────────

    def margin_trading(self, code: str, page_size: int = 30) -> list[MarginTradingItem]:
        """融资融券明细（日级）。"""
        raise NotImplementedError(f"{self.name} 不支持 margin_trading")

    def block_trade(self, code: str, page_size: int = 20) -> list[BlockTradeItem]:
        """大宗交易。"""
        raise NotImplementedError(f"{self.name} 不支持 block_trade")

    def holder_num(self, code: str, page_size: int = 10) -> list[HolderNumItem]:
        """股东户数变化。"""
        raise NotImplementedError(f"{self.name} 不支持 holder_num")

    def dividend_history(self, code: str, page_size: int = 20) -> list[DividendItem]:
        """分红送转历史。"""
        raise NotImplementedError(f"{self.name} 不支持 dividend_history")

    def fund_flow_120d(self, code: str) -> list[FundFlowDay]:
        """个股资金流（日级，120 日）。"""
        raise NotImplementedError(f"{self.name} 不支持 fund_flow_120d")

    def chip_distribution(
        self, code: str, days: int = 120, grid_size: int = 300, decay: float = 1.0
    ) -> ChipDistribution:
        """筹码分布（本地推演）。"""
        raise NotImplementedError(f"{self.name} 不支持 chip_distribution")
