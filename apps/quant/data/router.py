"""统一数据获取 API 路由（FastAPI APIRouter）。

沿用 server 端行情 API 的设计（symbol/tf/start/end/codes 等查询参数），
统一暴露当前已实现的行情能力：K 线 / 实时行情 / 逐笔成交 / 复权因子。

挂载：main.py 中 `include_router(router, prefix="/api/v1/data")`。
每个端点默认走 registry 的降级链，可用 `source` 参数强制指定某个数据源。

返回值统一为 snake_case（对齐 server 端 DB 表字段），多数据源之间字段口径
由 provider 层归一，调用方无需感知底层平台差异。
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from . import registry
from .base import (
    CAPABILITY_ADJUST_FACTOR,
    CAPABILITY_BLOCK_TRADE,
    CAPABILITY_BOARD_CONSTITUENTS,
    CAPABILITY_BOARD_FUND_FLOW,
    CAPABILITY_BOARD_KLINE,
    CAPABILITY_BOARD_LIST,
    CAPABILITY_CHIP_DISTRIBUTION,
    CAPABILITY_CONCEPT_BLOCKS,
    CAPABILITY_DAILY_DRAGON_TIGER,
    CAPABILITY_DIVIDEND_HISTORY,
    CAPABILITY_DRAGON_TIGER,
    CAPABILITY_FUND_FLOW_120D,
    CAPABILITY_FUND_FLOW_MINUTE,
    CAPABILITY_FUND_FLOW_RANK,
    CAPABILITY_HOLDER_NUM,
    CAPABILITY_HOT_REASON,
    CAPABILITY_INDUSTRY_COMPARISON,
    CAPABILITY_KLINE,
    CAPABILITY_LIMIT_UP_POOL,
    CAPABILITY_LOCKUP_EXPIRY,
    CAPABILITY_MARGIN_TRADING,
    CAPABILITY_NORTHBOUND,
    CAPABILITY_QUOTE,
    CAPABILITY_TRANSACTION,
)
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

router = APIRouter(tags=["data"])


def _pick(capability: str, source: str | None):
    """指定 source 则强制用该源，否则返回 None 表示走降级链。"""
    if source:
        provider = registry.get_provider(source)
        if capability not in provider.capabilities:
            raise HTTPException(400, f"数据源 {source} 不支持能力 {capability}")
        return provider
    providers = registry.providers_for(capability)
    if not providers:
        raise HTTPException(500, f"没有数据源支持能力 {capability}")
    return None  # None 表示走降级链


@router.get("/sources")
def list_sources():
    """列出各数据源及其能力，供调用方了解可切换的源。"""
    return {
        "providers": [
            {"name": p.name, "capabilities": sorted(p.capabilities)}
            for p in (registry.get_provider(n) for n in registry.all_provider_names())
        ]
    }


@router.get("/kline", response_model=list[KlineBar])
def get_kline(
    symbol: Annotated[str, Query(description="标的代码，如 600519 / 000001.SZ")],
    tf: Annotated[str, Query(description="周期：1m/5m/15m/30m/60m/1d/1w/1mo")] = "1d",
    adjust: Annotated[str, Query(description="复权口径（仅日线有效）：qfq 前复权（默认）/ hfq 后复权 / none 不复权")] = "qfq",
    start: Annotated[str | None, Query(description="起始日期 YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(description="结束日期 YYYY-MM-DD")] = None,
    limit: Annotated[int, Query(ge=1, le=5000, description="返回根数上限")] = 500,
    source: Annotated[str | None, Query(description="强制指定数据源")] = None,
) -> list[KlineBar]:
    """K 线。

    tf 多周期（1m~1mo）；adjust 复权仅 tf=1d 时有效（腾讯 fqkline 支持 qfq/hfq，
    mootdx/百度仅不复权）。非日线周期自动落到 mootdx（不复权，忽略 adjust）。

    来源：腾讯（主，日线前/后复权，不封 IP）→ mootdx（备，多周期不复权）→ 百度（备，日线带 MA）。
    遵循 skill 优先级，不再走东财 K 线（push2his 有风控、会封 IP）。
    """
    provider = _pick(CAPABILITY_KLINE, source)
    if provider is not None:
        return provider.kline(symbol, tf=tf, limit=limit, start=start, end=end, adjust=adjust)
    return registry.call_with_fallback(
        CAPABILITY_KLINE, "kline", symbol, tf=tf, limit=limit, start=start, end=end, adjust=adjust
    )


@router.get("/quotes", response_model=dict[str, Quote])
def get_quotes(
    codes: Annotated[str, Query(description="逗号分隔的代码列表")],
    source: Annotated[str | None, Query()] = None,
) -> dict[str, Quote]:
    """批量实时行情。来源：腾讯（主，含 PE/PB/市值/换手率）；降级：mootdx（五档盘口）。"""
    symbols = [c.strip() for c in codes.split(",") if c.strip()]
    if not symbols:
        return {}
    provider = _pick(CAPABILITY_QUOTE, source)
    if provider is not None:
        return provider.quote(symbols)
    return registry.call_with_fallback(CAPABILITY_QUOTE, "quote", symbols)


@router.get("/transaction", response_model=list[TradeTick])
def get_transaction(
    symbol: Annotated[str, Query()],
    date: Annotated[str | None, Query(description="交易日 YYYYMMDD，缺省为最近")] = None,
    source: Annotated[str | None, Query()] = None,
) -> list[TradeTick]:
    """逐笔成交。来源：mootdx 通达信（仅此源）；降级：无。"""
    provider = _pick(CAPABILITY_TRANSACTION, source)
    if provider is not None:
        return provider.transaction(symbol, date=date)
    return registry.call_with_fallback(CAPABILITY_TRANSACTION, "transaction", symbol, date=date)


@router.get("/adjust-factor", response_model=list[AdjustFactor])
def get_adjust_factor(
    symbol: Annotated[str, Query()],
    kind: Annotated[str, Query(description="qfq 前复权 / hfq 后复权")] = "qfq",
    source: Annotated[str | None, Query()] = None,
) -> list[AdjustFactor]:
    """复权因子序列。来源：新浪（仅此源，qfq/hfq）；降级：无。"""
    provider = _pick(CAPABILITY_ADJUST_FACTOR, source)
    if provider is not None:
        return provider.adjust_factor(symbol, kind=kind)
    return registry.call_with_fallback(
        CAPABILITY_ADJUST_FACTOR, "adjust_factor", symbol, kind=kind
    )


# ============================================================================
# 信号层（Layer 3）
# ============================================================================


@router.get("/hot-reason", response_model=list[HotReasonItem])
def get_hot_reason(
    date: Annotated[str | None, Query(description="YYYY-MM-DD，缺省为今天")] = None,
    source: Annotated[str | None, Query()] = None,
) -> list[HotReasonItem]:
    """同花顺当日强势股 + 题材归因。来源：同花顺（仅此源）；降级：无。"""
    provider = _pick(CAPABILITY_HOT_REASON, source)
    if provider is not None:
        return provider.hot_reason(date=date)
    return registry.call_with_fallback(CAPABILITY_HOT_REASON, "hot_reason", date=date)


@router.get("/northbound", response_model=list[NorthboundPoint])
def get_northbound(source: Annotated[str | None, Query()] = None) -> list[NorthboundPoint]:
    """沪深股通当日实时分钟流向。来源：同花顺（仅此源）；降级：无。"""
    provider = _pick(CAPABILITY_NORTHBOUND, source)
    if provider is not None:
        return provider.northbound()
    return registry.call_with_fallback(CAPABILITY_NORTHBOUND, "northbound")


@router.get("/concept-blocks", response_model=ConceptBlocks)
def get_concept_blocks(
    symbol: Annotated[str, Query(description="标的代码，如 600519")],
    source: Annotated[str | None, Query()] = None,
) -> ConceptBlocks:
    """个股所属板块/概念归属。来源：东财 slist（独有）；降级：无，走 _em_get 防封。"""
    provider = _pick(CAPABILITY_CONCEPT_BLOCKS, source)
    if provider is not None:
        return provider.concept_blocks(symbol)
    return registry.call_with_fallback(CAPABILITY_CONCEPT_BLOCKS, "concept_blocks", symbol)


@router.get("/fund-flow-minute", response_model=list[FundFlowPoint])
def get_fund_flow_minute(
    symbol: Annotated[str, Query()],
    source: Annotated[str | None, Query()] = None,
) -> list[FundFlowPoint]:
    """个股资金流向（分钟级）。来源：东财 push2（独有）；降级：无，走 _em_get 防封。"""
    provider = _pick(CAPABILITY_FUND_FLOW_MINUTE, source)
    if provider is not None:
        return provider.fund_flow_minute(symbol)
    return registry.call_with_fallback(CAPABILITY_FUND_FLOW_MINUTE, "fund_flow_minute", symbol)


@router.get("/dragon-tiger", response_model=DragonTigerBoard)
def get_dragon_tiger(
    symbol: Annotated[str, Query()],
    trade_date: Annotated[str | None, Query(description="YYYY-MM-DD，缺省为今天")] = None,
    look_back: Annotated[int, Query(ge=1, le=365, description="回看天数")] = 30,
    source: Annotated[str | None, Query()] = None,
) -> DragonTigerBoard:
    """个股龙虎榜（上榜记录 + 买卖席位 + 机构动向）。来源：东财 datacenter（独有）；降级：无。"""
    provider = _pick(CAPABILITY_DRAGON_TIGER, source)
    if provider is not None:
        return provider.dragon_tiger(symbol, trade_date=trade_date, look_back=look_back)
    return registry.call_with_fallback(
        CAPABILITY_DRAGON_TIGER, "dragon_tiger", symbol, trade_date=trade_date, look_back=look_back
    )


@router.get("/lockup-expiry", response_model=LockupExpiry)
def get_lockup_expiry(
    symbol: Annotated[str, Query()],
    trade_date: Annotated[str | None, Query()] = None,
    forward_days: Annotated[int, Query(ge=1, le=365)] = 90,
    source: Annotated[str | None, Query()] = None,
) -> LockupExpiry:
    """限售解禁日历（历史 + 未来 N 天）。来源：东财 datacenter（独有）；降级：无。"""
    provider = _pick(CAPABILITY_LOCKUP_EXPIRY, source)
    if provider is not None:
        return provider.lockup_expiry(symbol, trade_date=trade_date, forward_days=forward_days)
    return registry.call_with_fallback(
        CAPABILITY_LOCKUP_EXPIRY, "lockup_expiry", symbol, trade_date=trade_date, forward_days=forward_days
    )


@router.get("/industry-comparison", response_model=IndustryComparison)
def get_industry_comparison(
    top_n: Annotated[int, Query(ge=1, le=100)] = 20,
    source: Annotated[str | None, Query()] = None,
) -> IndustryComparison:
    """全行业涨跌幅排名。来源：东财 push2 clist（独有）；降级：无，走 _em_get 防封。"""
    provider = _pick(CAPABILITY_INDUSTRY_COMPARISON, source)
    if provider is not None:
        return provider.industry_comparison(top_n=top_n)
    return registry.call_with_fallback(CAPABILITY_INDUSTRY_COMPARISON, "industry_comparison", top_n=top_n)


@router.get("/board-fund-flow", response_model=BoardFundFlow)
def get_board_fund_flow(
    board_type: Annotated[str, Query(description="industry/concept/region")] = "industry",
    period: Annotated[str, Query(description="today/5d/10d")] = "today",
    top_n: Annotated[int | None, Query(ge=1, le=100, description="返回前 N 名，不传返回全量板块")] = None,
    source: Annotated[str | None, Query()] = None,
) -> BoardFundFlow:
    """板块资金流向（行业/概念/地域 × 今日/5日/10日）。来源：东财 push2 clist（独有）；降级：无。"""
    provider = _pick(CAPABILITY_BOARD_FUND_FLOW, source)
    if provider is not None:
        return provider.board_fund_flow(board_type=board_type, period=period, top_n=top_n)
    return registry.call_with_fallback(
        CAPABILITY_BOARD_FUND_FLOW, "board_fund_flow", board_type=board_type, period=period, top_n=top_n
    )


@router.get("/fund-flow-rank", response_model=list[FundFlowRankItem])
def get_fund_flow_rank(
    top_n: Annotated[int | None, Query(ge=1, le=300, description="返回前 N 名，不传返回全量个股")] = None,
    source: Annotated[str | None, Query()] = None,
) -> list[FundFlowRankItem]:
    """全市场个股资金流排行（按主力净流入降序）。来源：东财 push2 clist（独有）；降级：无。"""
    provider = _pick(CAPABILITY_FUND_FLOW_RANK, source)
    if provider is not None:
        return provider.fund_flow_rank(indicator="today", top_n=top_n)
    return registry.call_with_fallback(
        CAPABILITY_FUND_FLOW_RANK, "fund_flow_rank", indicator="today", top_n=top_n
    )


@router.get("/limit-up-pool", response_model=list[LimitUpPoolItem])
def get_limit_up_pool(
    date: Annotated[str | None, Query(description="YYYY-MM-DD，缺省为今天")] = None,
    source: Annotated[str | None, Query()] = None,
) -> list[LimitUpPoolItem]:
    """当日涨停池。来源：东财 getTopicZTPool（独有）；降级：无，走 _em_get 防封。"""
    provider = _pick(CAPABILITY_LIMIT_UP_POOL, source)
    if provider is not None:
        return provider.limit_up_pool(date=date)
    return registry.call_with_fallback(CAPABILITY_LIMIT_UP_POOL, "limit_up_pool", date=date)


@router.get("/board-list", response_model=BoardList)
def get_board_list(
    board_type: Annotated[str, Query(description="industry/concept")] = "industry",
    source: Annotated[str | None, Query()] = None,
) -> BoardList:
    """板块列表（行业/概念），供热力图一级节点。来源：东财 push2 clist（独有）；降级：无。"""
    provider = _pick(CAPABILITY_BOARD_LIST, source)
    if provider is not None:
        return provider.board_list(board_type=board_type)
    return registry.call_with_fallback(CAPABILITY_BOARD_LIST, "board_list", board_type=board_type)


@router.get("/board-constituents", response_model=list[BoardConstituentItem])
def get_board_constituents(
    board_code: Annotated[str, Query(description="BK 板块代码，如 BK0475")],
    source: Annotated[str | None, Query()] = None,
) -> list[BoardConstituentItem]:
    """板块成分股列表，供热力图二级节点。来源：东财 push2 clist（独有）；降级：无。"""
    provider = _pick(CAPABILITY_BOARD_CONSTITUENTS, source)
    if provider is not None:
        return provider.board_constituents(board_code)
    return registry.call_with_fallback(CAPABILITY_BOARD_CONSTITUENTS, "board_constituents", board_code)


@router.get("/board-kline", response_model=list[KlineBar])
def get_board_kline(
    board_code: Annotated[str, Query(description="BK 板块代码，如 BK0475")],
    limit: Annotated[int | None, Query(ge=1, le=10000, description="返回根数上限，不传返回全量")] = None,
    start: Annotated[str | None, Query(description="起始日期 YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(description="结束日期 YYYY-MM-DD")] = None,
    source: Annotated[str | None, Query()] = None,
) -> list[KlineBar]:
    """板块指数日 K 线。来源：东财 push2his（BK 指数独有）；降级：无，走 _em_get 防封。"""
    provider = _pick(CAPABILITY_BOARD_KLINE, source)
    if provider is not None:
        return provider.board_kline(board_code, limit=limit, start=start, end=end)
    return registry.call_with_fallback(
        CAPABILITY_BOARD_KLINE, "board_kline", board_code, limit=limit, start=start, end=end
    )


@router.get("/daily-dragon-tiger", response_model=DailyDragonTiger)
def get_daily_dragon_tiger(
    trade_date: Annotated[str | None, Query(description="YYYY-MM-DD，缺省为今天")] = None,
    min_net_buy: Annotated[float | None, Query(description="净买入下限（万元）")] = None,
    source: Annotated[str | None, Query()] = None,
) -> DailyDragonTiger:
    """全市场龙虎榜汇总。来源：东财 datacenter（独有）；降级：无。"""
    provider = _pick(CAPABILITY_DAILY_DRAGON_TIGER, source)
    if provider is not None:
        return provider.daily_dragon_tiger(trade_date=trade_date, min_net_buy=min_net_buy)
    return registry.call_with_fallback(
        CAPABILITY_DAILY_DRAGON_TIGER, "daily_dragon_tiger", trade_date=trade_date, min_net_buy=min_net_buy
    )


# ============================================================================
# 资金面 / 筹码层（Layer 4）
# ============================================================================


@router.get("/margin-trading", response_model=list[MarginTradingItem])
def get_margin_trading(
    symbol: Annotated[str, Query()],
    page_size: Annotated[int, Query(ge=1, le=100)] = 30,
    source: Annotated[str | None, Query()] = None,
) -> list[MarginTradingItem]:
    """融资融券明细（日级）。来源：东财 datacenter（独有）；降级：无。"""
    provider = _pick(CAPABILITY_MARGIN_TRADING, source)
    if provider is not None:
        return provider.margin_trading(symbol, page_size=page_size)
    return registry.call_with_fallback(
        CAPABILITY_MARGIN_TRADING, "margin_trading", symbol, page_size=page_size
    )


@router.get("/block-trade", response_model=list[BlockTradeItem])
def get_block_trade(
    symbol: Annotated[str, Query()],
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    source: Annotated[str | None, Query()] = None,
) -> list[BlockTradeItem]:
    """大宗交易记录。来源：东财 datacenter（独有）；降级：无。"""
    provider = _pick(CAPABILITY_BLOCK_TRADE, source)
    if provider is not None:
        return provider.block_trade(symbol, page_size=page_size)
    return registry.call_with_fallback(
        CAPABILITY_BLOCK_TRADE, "block_trade", symbol, page_size=page_size
    )


@router.get("/holder-num", response_model=list[HolderNumItem])
def get_holder_num(
    symbol: Annotated[str, Query()],
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    source: Annotated[str | None, Query()] = None,
) -> list[HolderNumItem]:
    """股东户数变化（季度级）。来源：东财 datacenter（独有）；降级：无。"""
    provider = _pick(CAPABILITY_HOLDER_NUM, source)
    if provider is not None:
        return provider.holder_num(symbol, page_size=page_size)
    return registry.call_with_fallback(
        CAPABILITY_HOLDER_NUM, "holder_num", symbol, page_size=page_size
    )


@router.get("/dividend-history", response_model=list[DividendItem])
def get_dividend_history(
    symbol: Annotated[str, Query()],
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    source: Annotated[str | None, Query()] = None,
) -> list[DividendItem]:
    """分红送转历史。来源：东财 datacenter（独有）；降级：无。"""
    provider = _pick(CAPABILITY_DIVIDEND_HISTORY, source)
    if provider is not None:
        return provider.dividend_history(symbol, page_size=page_size)
    return registry.call_with_fallback(
        CAPABILITY_DIVIDEND_HISTORY, "dividend_history", symbol, page_size=page_size
    )


@router.get("/fund-flow-120d", response_model=list[FundFlowDay])
def get_fund_flow_120d(
    symbol: Annotated[str, Query()],
    source: Annotated[str | None, Query()] = None,
) -> list[FundFlowDay]:
    """个股资金流（日级，最近 120 个交易日）。来源：东财 push2his（独有）；降级：无。"""
    provider = _pick(CAPABILITY_FUND_FLOW_120D, source)
    if provider is not None:
        return provider.fund_flow_120d(symbol)
    return registry.call_with_fallback(CAPABILITY_FUND_FLOW_120D, "fund_flow_120d", symbol)


@router.get("/chip-distribution", response_model=ChipDistribution)
def get_chip_distribution(
    symbol: Annotated[str, Query()],
    days: Annotated[int, Query(ge=30, le=1000, description="回看交易日数")] = 120,
    grid_size: Annotated[int, Query(ge=50, le=1000)] = 300,
    decay: Annotated[float, Query(ge=0.1, le=3.0, description="换手衰减系数")] = 1.0,
    source: Annotated[str | None, Query()] = None,
) -> ChipDistribution:
    """筹码分布（本地推演：获利比例 / 平均成本 / 成本区间 / 筹码峰）。来源：mootdx 日线 OHLC + 腾讯流通市值本地推演；降级：无。"""
    provider = _pick(CAPABILITY_CHIP_DISTRIBUTION, source)
    if provider is not None:
        return provider.chip_distribution(symbol, days=days, grid_size=grid_size, decay=decay)
    return registry.call_with_fallback(
        CAPABILITY_CHIP_DISTRIBUTION, "chip_distribution", symbol, days=days, grid_size=grid_size, decay=decay
    )
