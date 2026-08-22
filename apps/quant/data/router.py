"""
stock-sdk 数据源 API 声明（FastAPI Router）。

严格对齐 stock-sdk `StockSDK` 实例暴露的全部数据接口（命名空间、方法、
参数、返回），仅声明契约、不实现业务逻辑 —— 每个端点均抛 `NotImplementedError`，
供后续切换 / 接入数据源时按此契约实现。

路径约定：
- 命名空间用路径段表达（`quotes` / `kline` / `board` / ...）
- 标的 / 代码类入参用 path 参数；查询选项（Options）用 query 模型展开；
  数组入参（codes）用逗号分隔的 query 参数。
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from . import params as P
from . import schemas as S

router = APIRouter()

# 市场实时状态（stock-sdk `MarketStatus`，作为字符串返回）
MarketStatus = Literal["pre_market", "open", "lunch_break", "after_hours", "closed"]


class BatchRawItem(BaseModel):
    """`batch.raw` 的匿名返回结构。"""

    key: str
    fields: list[str]


# ===========================================================================
# 实时行情 quotes
# ===========================================================================

@router.get("/quotes/cn", response_model=list[S.FullQuote])
def quotes_cn(codes: Annotated[list[str], Query()]):
    """A 股 / 指数全量行情。"""
    raise NotImplementedError("quotes.cn 待实现")


@router.get("/quotes/cn-simple", response_model=list[S.SimpleQuote])
def quotes_cn_simple(codes: Annotated[list[str], Query()]):
    """A 股简要行情。"""
    raise NotImplementedError("quotes.cnSimple 待实现")


@router.get("/quotes/hk", response_model=list[S.HKQuote])
def quotes_hk(codes: Annotated[list[str], Query()]):
    """港股扩展行情。"""
    raise NotImplementedError("quotes.hk 待实现")


@router.get("/quotes/us", response_model=list[S.USQuote])
def quotes_us(codes: Annotated[list[str], Query()]):
    """美股行情。"""
    raise NotImplementedError("quotes.us 待实现")


@router.get("/quotes/fund", response_model=list[S.FundQuote])
def quotes_fund(codes: Annotated[list[str], Query()]):
    """公募基金行情。"""
    raise NotImplementedError("quotes.fund 待实现")


@router.get("/quotes/fund-flow", response_model=list[S.FundFlow])
def quotes_fund_flow(codes: Annotated[list[str], Query()]):
    """个股实时资金流向。"""
    raise NotImplementedError("quotes.fundFlow 待实现")


@router.get("/quotes/large-order", response_model=list[S.PanelLargeOrder])
def quotes_large_order(codes: Annotated[list[str], Query()]):
    """盘口大单占比。"""
    raise NotImplementedError("quotes.largeOrder 待实现")


@router.get("/quotes/timeline/{code}", response_model=S.TodayTimelineResponse)
def quotes_timeline(code: str):
    """当日分时。"""
    raise NotImplementedError("quotes.timeline 待实现")


# ===========================================================================
# 代码列表 codes
# ===========================================================================

@router.get("/codes/cn", response_model=list[str])
def codes_cn(options: P.GetAShareCodeListOptions = Depends()):
    """A 股代码列表。"""
    raise NotImplementedError("codes.cn 待实现")


@router.get("/codes/us", response_model=list[str])
def codes_us(options: P.GetUSCodeListOptions = Depends()):
    """美股代码列表。"""
    raise NotImplementedError("codes.us 待实现")


@router.get("/codes/hk", response_model=list[str])
def codes_hk():
    """港股代码列表。"""
    raise NotImplementedError("codes.hk 待实现")


@router.get("/codes/fund", response_model=list[str])
def codes_fund():
    """公募基金代码列表。"""
    raise NotImplementedError("codes.fund 待实现")


# ===========================================================================
# 批量行情 batch
# ===========================================================================

@router.get("/batch/cn", response_model=list[S.FullQuote])
def batch_cn(options: P.GetAllAShareQuotesOptions = Depends()):
    """全部 A 股行情。"""
    raise NotImplementedError("batch.cn 待实现")


@router.get("/batch/hk", response_model=list[S.HKQuote])
def batch_hk(options: P.GetAllHKQuotesOptions = Depends()):
    """全部港股行情。"""
    raise NotImplementedError("batch.hk 待实现")


@router.get("/batch/us", response_model=list[S.USQuote])
def batch_us(options: P.GetAllUSQuotesOptions = Depends()):
    """全部美股行情。"""
    raise NotImplementedError("batch.us 待实现")


@router.get("/batch/by-codes", response_model=list[S.FullQuote])
def batch_by_codes(
    codes: Annotated[list[str], Query()],
    options: P.GetAllAShareQuotesOptions = Depends(),
):
    """按代码列表批量取 A 股行情。"""
    raise NotImplementedError("batch.byCodes 待实现")


@router.get("/batch/raw", response_model=list[BatchRawItem])
def batch_raw(params: Annotated[str, Query(alias="params")]):
    """腾讯财经批量原始接口。"""
    raise NotImplementedError("batch.raw 待实现")


# ===========================================================================
# K 线 / 分时 kline
# ===========================================================================

@router.get("/kline/cn/{symbol}", response_model=list[S.HistoryKline])
def kline_cn(symbol: str, options: P.HistoryKlineOptions = Depends()):
    """A 股历史 K 线（日/周/月）。"""
    raise NotImplementedError("kline.cn 待实现")


@router.get(
    "/kline/cn/minute/{symbol}",
    response_model=list[S.MinuteTimeline] | list[S.MinuteKline],
)
def kline_cn_minute(symbol: str, options: P.MinuteKlineOptions = Depends()):
    """A 股分钟 K 线 / 分时。"""
    raise NotImplementedError("kline.cnMinute 待实现")


@router.get("/kline/hk/{symbol}", response_model=list[S.HKHistoryKline])
def kline_hk(symbol: str, options: P.HKKlineOptions = Depends()):
    """港股历史 K 线。"""
    raise NotImplementedError("kline.hk 待实现")


@router.get(
    "/kline/hk/minute/{symbol}",
    response_model=list[S.HKMinuteTimeline] | list[S.HKMinuteKline],
)
def kline_hk_minute(symbol: str, options: P.HKMinuteKlineOptions = Depends()):
    """港股分钟 K 线 / 分时。"""
    raise NotImplementedError("kline.hkMinute 待实现")


@router.get("/kline/us/{symbol}", response_model=list[S.USHistoryKline])
def kline_us(symbol: str, options: P.USKlineOptions = Depends()):
    """美股历史 K 线。"""
    raise NotImplementedError("kline.us 待实现")


@router.get(
    "/kline/us/minute/{symbol}",
    response_model=list[S.USMinuteTimeline] | list[S.USMinuteKline],
)
def kline_us_minute(symbol: str, options: P.USMinuteKlineOptions = Depends()):
    """美股分钟 K 线 / 分时。"""
    raise NotImplementedError("kline.usMinute 待实现")


@router.get("/kline/with-indicators/{symbol}", response_model=list[S.KlineWithIndicators])
def kline_with_indicators(symbol: str, options: P.KlineWithIndicatorsOptions = Depends()):
    """带技术指标的 K 线。"""
    raise NotImplementedError("kline.withIndicators 待实现")


@router.get("/kline/signals/{symbol}", response_model=list[S.KlineSignal])
def kline_signals(symbol: str, options: P.KlineSignalsOptions = Depends()):
    """K 线指标信号识别。"""
    raise NotImplementedError("kline.signals 待实现")


# ===========================================================================
# 筹码分布 chips
# ===========================================================================

@router.get("/chips/cn/{symbol}", response_model=list[S.ChipDistributionItem])
def chips_cn(symbol: str, options: P.ChipDistributionRequestOptions = Depends()):
    """A 股筹码分布。"""
    raise NotImplementedError("chips.cn 待实现")


@router.get("/chips/hk/{symbol}", response_model=list[S.ChipDistributionItem])
def chips_hk(symbol: str, options: P.ChipDistributionRequestOptions = Depends()):
    """港股筹码分布。"""
    raise NotImplementedError("chips.hk 待实现")


@router.get("/chips/us/{symbol}", response_model=list[S.ChipDistributionItem])
def chips_us(symbol: str, options: P.ChipDistributionRequestOptions = Depends()):
    """美股筹码分布。"""
    raise NotImplementedError("chips.us 待实现")


# ===========================================================================
# 板块 board（行业 / 概念）
# ===========================================================================

@router.get("/board/industry/list", response_model=list[S.IndustryBoard])
def board_industry_list():
    """行业板块列表。"""
    raise NotImplementedError("board.industry.list 待实现")


@router.get("/board/industry/spot/{symbol}", response_model=list[S.IndustryBoardSpot])
def board_industry_spot(symbol: str):
    """行业板块实时行情指标。"""
    raise NotImplementedError("board.industry.spot 待实现")


@router.get(
    "/board/industry/constituents/{symbol}",
    response_model=list[S.IndustryBoardConstituent],
)
def board_industry_constituents(symbol: str):
    """行业板块成分股。"""
    raise NotImplementedError("board.industry.constituents 待实现")


@router.get("/board/industry/kline/{symbol}", response_model=list[S.IndustryBoardKline])
def board_industry_kline(symbol: str, options: P.BoardKlineOptions = Depends()):
    """行业板块历史 K 线。"""
    raise NotImplementedError("board.industry.kline 待实现")


@router.get(
    "/board/industry/minute-kline/{symbol}",
    response_model=list[S.IndustryBoardMinuteTimeline] | list[S.IndustryBoardMinuteKline],
)
def board_industry_minute_kline(symbol: str, options: P.BoardMinuteKlineOptions = Depends()):
    """行业板块分钟 K 线。"""
    raise NotImplementedError("board.industry.minuteKline 待实现")


@router.get("/board/concept/list", response_model=list[S.ConceptBoard])
def board_concept_list():
    """概念板块列表。"""
    raise NotImplementedError("board.concept.list 待实现")


@router.get("/board/concept/spot/{symbol}", response_model=list[S.ConceptBoardSpot])
def board_concept_spot(symbol: str):
    """概念板块实时行情指标。"""
    raise NotImplementedError("board.concept.spot 待实现")


@router.get(
    "/board/concept/constituents/{symbol}",
    response_model=list[S.ConceptBoardConstituent],
)
def board_concept_constituents(symbol: str):
    """概念板块成分股。"""
    raise NotImplementedError("board.concept.constituents 待实现")


@router.get("/board/concept/kline/{symbol}", response_model=list[S.ConceptBoardKline])
def board_concept_kline(symbol: str, options: P.BoardKlineOptions = Depends()):
    """概念板块历史 K 线。"""
    raise NotImplementedError("board.concept.kline 待实现")


@router.get(
    "/board/concept/minute-kline/{symbol}",
    response_model=list[S.ConceptBoardMinuteTimeline] | list[S.ConceptBoardMinuteKline],
)
def board_concept_minute_kline(symbol: str, options: P.BoardMinuteKlineOptions = Depends()):
    """概念板块分钟 K 线。"""
    raise NotImplementedError("board.concept.minuteKline 待实现")


# ===========================================================================
# 期权 options
# ===========================================================================

@router.get("/options/index/spot", response_model=S.OptionTQuoteResult)
def options_index_spot(
    product: Annotated[P.IndexOptionProduct, Query()],
    contract: Annotated[str, Query()],
):
    """股指期权 T 型报价。"""
    raise NotImplementedError("options.index.spot 待实现")


@router.get("/options/index/kline/{symbol}", response_model=list[S.OptionKline])
def options_index_kline(symbol: str):
    """股指期权日 K 线。"""
    raise NotImplementedError("options.index.kline 待实现")


@router.get("/options/etf/months", response_model=S.ETFOptionMonth)
def options_etf_months(cate: Annotated[P.ETFOptionCate, Query()]):
    """ETF 期权月份信息。"""
    raise NotImplementedError("options.etf.months 待实现")


@router.get("/options/etf/expire-day", response_model=S.ETFOptionExpireDay)
def options_etf_expire_day(
    cate: Annotated[P.ETFOptionCate, Query()],
    month: Annotated[str, Query()],
):
    """ETF 期权到期信息。"""
    raise NotImplementedError("options.etf.expireDay 待实现")


@router.get("/options/etf/minute/{code}", response_model=list[S.OptionMinute])
def options_etf_minute(code: str):
    """ETF 期权分钟数据。"""
    raise NotImplementedError("options.etf.minute 待实现")


@router.get("/options/etf/daily-kline/{code}", response_model=list[S.OptionKline])
def options_etf_daily_kline(code: str):
    """ETF 期权日 K 线。"""
    raise NotImplementedError("options.etf.dailyKline 待实现")


@router.get("/options/etf/five-day-minute/{code}", response_model=list[S.OptionMinute])
def options_etf_five_day_minute(code: str):
    """ETF 期权近五日分钟数据。"""
    raise NotImplementedError("options.etf.fiveDayMinute 待实现")


@router.get("/options/commodity/spot", response_model=S.OptionTQuoteResult)
def options_commodity_spot(
    variety: Annotated[str, Query()],
    contract: Annotated[str, Query()],
):
    """商品期权 T 型报价。"""
    raise NotImplementedError("options.commodity.spot 待实现")


@router.get("/options/commodity/kline/{symbol}", response_model=list[S.OptionKline])
def options_commodity_kline(symbol: str):
    """商品期权日 K 线。"""
    raise NotImplementedError("options.commodity.kline 待实现")


@router.get("/options/cffex/quotes", response_model=list[S.CFFEXOptionQuote])
def options_cffex_quotes(options: P.CFFEXOptionQuotesOptions = Depends()):
    """中金所期权实时行情列表。"""
    raise NotImplementedError("options.cffex.quotes 待实现")


@router.get("/options/lhb", response_model=list[S.OptionLHBItem])
def options_lhb(
    symbol: Annotated[str, Query()],
    date: Annotated[str, Query()],
):
    """期权龙虎榜。"""
    raise NotImplementedError("options.lhb 待实现")


# ===========================================================================
# 期货 futures
# ===========================================================================

@router.get("/futures/kline/{symbol}", response_model=list[S.FuturesKline])
def futures_kline(symbol: str, options: P.FuturesKlineOptions = Depends()):
    """国内期货 K 线。"""
    raise NotImplementedError("futures.kline 待实现")


@router.get("/futures/global-spot", response_model=list[S.GlobalFuturesQuote])
def futures_global_spot(options: P.GlobalFuturesSpotOptions = Depends()):
    """全球期货实时报价。"""
    raise NotImplementedError("futures.globalSpot 待实现")


@router.get("/futures/global-kline/{symbol}", response_model=list[S.FuturesKline])
def futures_global_kline(symbol: str, options: P.GlobalFuturesKlineOptions = Depends()):
    """全球期货 K 线。"""
    raise NotImplementedError("futures.globalKline 待实现")


@router.get("/futures/inventory-symbols", response_model=list[S.FuturesInventorySymbol])
def futures_inventory_symbols():
    """期货库存品种列表。"""
    raise NotImplementedError("futures.inventorySymbols 待实现")


@router.get("/futures/inventory/{symbol}", response_model=list[S.FuturesInventory])
def futures_inventory(symbol: str, options: P.FuturesInventoryOptions = Depends()):
    """期货库存数据。"""
    raise NotImplementedError("futures.inventory 待实现")


@router.get("/futures/comex-inventory/{symbol}", response_model=list[S.ComexInventory])
def futures_comex_inventory(
    symbol: Literal["gold", "silver"],
    options: P.ComexInventoryOptions = Depends(),
):
    """COMEX 库存数据。"""
    raise NotImplementedError("futures.comexInventory 待实现")


# ===========================================================================
# 资金流向 fundFlow
# ===========================================================================

@router.get("/fund-flow/individual/{symbol}", response_model=list[S.StockFundFlowDaily])
def fund_flow_individual(symbol: str, options: P.FundFlowOptions = Depends()):
    """个股资金流（日/周/月线）。"""
    raise NotImplementedError("fundFlow.individual 待实现")


@router.get("/fund-flow/market", response_model=list[S.MarketFundFlow])
def fund_flow_market():
    """大盘资金流（按日）。"""
    raise NotImplementedError("fundFlow.market 待实现")


@router.get("/fund-flow/rank", response_model=list[S.FundFlowRankItem])
def fund_flow_rank(options: P.FundFlowRankOptions = Depends()):
    """个股资金流排名。"""
    raise NotImplementedError("fundFlow.rank 待实现")


@router.get("/fund-flow/sector-rank", response_model=list[S.SectorFundFlowItem])
def fund_flow_sector_rank(options: P.FundFlowRankOptions = Depends()):
    """板块资金流排名。"""
    raise NotImplementedError("fundFlow.sectorRank 待实现")


@router.get("/fund-flow/sector-history/{symbol}", response_model=list[S.StockFundFlowDaily])
def fund_flow_sector_history(symbol: str, options: P.FundFlowOptions = Depends()):
    """板块资金流历史。"""
    raise NotImplementedError("fundFlow.sectorHistory 待实现")


# ===========================================================================
# 沪深港通 / 北向 northbound
# ===========================================================================

@router.get("/northbound/minute", response_model=list[S.NorthboundMinuteItem])
def northbound_minute(
    direction: Annotated[P.NorthboundDirection | None, Query()] = None,
):
    """北向 / 南向资金分时。"""
    raise NotImplementedError("northbound.minute 待实现")


@router.get("/northbound/summary", response_model=list[S.NorthboundFlowSummary])
def northbound_summary():
    """沪深港通市场资金流向汇总。"""
    raise NotImplementedError("northbound.summary 待实现")


@router.get("/northbound/holding-rank", response_model=list[S.NorthboundHoldingRankItem])
def northbound_holding_rank(options: P.NorthboundHoldingRankOptions = Depends()):
    """北向持股个股排行。"""
    raise NotImplementedError("northbound.holdingRank 待实现")


@router.get("/northbound/history", response_model=list[S.NorthboundHistoryItem])
def northbound_history(
    direction: Annotated[P.NorthboundDirection | None, Query()] = None,
    options: P.NorthboundHistoryOptions = Depends(),
):
    """北向资金历史。"""
    raise NotImplementedError("northbound.history 待实现")


@router.get("/northbound/individual/{symbol}", response_model=list[S.NorthboundIndividualItem])
def northbound_individual(symbol: str, options: P.NorthboundHistoryOptions = Depends()):
    """个股北向持仓历史。"""
    raise NotImplementedError("northbound.individual 待实现")


# ===========================================================================
# 涨停 / 盘口异动 marketEvent
# ===========================================================================

@router.get("/market-event/zt-pool", response_model=list[S.ZTPoolItem])
def market_event_zt_pool(
    type: Annotated[P.ZTPoolType | None, Query(alias="type")] = None,
    date: Annotated[str | None, Query()] = None,
):
    """涨停股池。"""
    raise NotImplementedError("marketEvent.ztPool 待实现")


@router.get("/market-event/stock-changes", response_model=list[S.StockChangeItem])
def market_event_stock_changes(
    type: Annotated[str | None, Query(alias="type")] = None,
):
    """盘口异动（`type` 可为单个类型 / 逗号分隔 / `'all'`）。"""
    raise NotImplementedError("marketEvent.stockChanges 待实现")


@router.get("/market-event/board-changes", response_model=list[S.BoardChangeItem])
def market_event_board_changes():
    """板块异动。"""
    raise NotImplementedError("marketEvent.boardChanges 待实现")


@router.get(
    "/market-event/individual-changes/{symbol}",
    response_model=list[S.IndividualStockChangeItem],
)
def market_event_individual_changes(
    symbol: str,
    options: P.IndividualChangesOptions = Depends(),
):
    """个股盘口异动事件。"""
    raise NotImplementedError("marketEvent.individualChanges 待实现")


@router.get(
    "/market-event/individual-changes-history/{symbol}",
    response_model=S.IndividualChangesHistory,
)
def market_event_individual_changes_history(
    symbol: str,
    options: P.IndividualChangesHistoryOptions = Depends(),
):
    """个股近 N 天异动历史。"""
    raise NotImplementedError("marketEvent.individualChangesHistory 待实现")


# ===========================================================================
# 龙虎榜 dragonTiger
# ===========================================================================

@router.get("/dragon-tiger/detail", response_model=list[S.DragonTigerDetailItem])
def dragon_tiger_detail(options: P.DragonTigerDateOptions = Depends()):
    """龙虎榜详情。"""
    raise NotImplementedError("dragonTiger.detail 待实现")


@router.get("/dragon-tiger/stock-stats", response_model=list[S.DragonTigerStockStatItem])
def dragon_tiger_stock_stats(
    period: Annotated[P.DragonTigerPeriod | None, Query()] = None,
):
    """龙虎榜个股上榜统计。"""
    raise NotImplementedError("dragonTiger.stockStats 待实现")


@router.get("/dragon-tiger/institution", response_model=list[S.DragonTigerInstitutionItem])
def dragon_tiger_institution(options: P.DragonTigerDateOptions = Depends()):
    """龙虎榜机构买卖。"""
    raise NotImplementedError("dragonTiger.institution 待实现")


@router.get("/dragon-tiger/branch-rank", response_model=list[S.DragonTigerBranchItem])
def dragon_tiger_branch_rank(
    period: Annotated[P.DragonTigerPeriod | None, Query()] = None,
):
    """龙虎榜营业部排行。"""
    raise NotImplementedError("dragonTiger.branchRank 待实现")


@router.get("/dragon-tiger/seat-detail/{symbol}", response_model=list[S.DragonTigerSeatItem])
def dragon_tiger_seat_detail(
    symbol: str,
    date: Annotated[str, Query()],
):
    """龙虎榜个股席位明细。"""
    raise NotImplementedError("dragonTiger.seatDetail 待实现")


# ===========================================================================
# 大宗交易 blockTrade
# ===========================================================================

@router.get("/block-trade/market-stat", response_model=list[S.BlockTradeMarketStatItem])
def block_trade_market_stat():
    """大宗交易市场统计。"""
    raise NotImplementedError("blockTrade.marketStat 待实现")


@router.get("/block-trade/detail", response_model=list[S.BlockTradeDetailItem])
def block_trade_detail(options: P.BlockTradeDateOptions = Depends()):
    """大宗交易明细。"""
    raise NotImplementedError("blockTrade.detail 待实现")


@router.get("/block-trade/daily-stat", response_model=list[S.BlockTradeDailyStatItem])
def block_trade_daily_stat(options: P.BlockTradeDateOptions = Depends()):
    """大宗交易每日统计。"""
    raise NotImplementedError("blockTrade.dailyStat 待实现")


# ===========================================================================
# 融资融券 margin
# ===========================================================================

@router.get("/margin/account-info", response_model=list[S.MarginAccountItem])
def margin_account_info():
    """融资融券账户统计。"""
    raise NotImplementedError("margin.accountInfo 待实现")


@router.get("/margin/target-list", response_model=list[S.MarginTargetItem])
def margin_target_list(date: Annotated[str | None, Query()] = None):
    """融资融券标的证券。"""
    raise NotImplementedError("margin.targetList 待实现")


# ===========================================================================
# 公募基金 fund
# ===========================================================================

@router.get("/fund/dividend-list", response_model=S.FundDividendListResult)
def fund_dividend_list(options: P.FundDividendListOptions = Depends()):
    """基金分红明细。"""
    raise NotImplementedError("fund.dividendList 待实现")


@router.get("/fund/nav-history/{code}", response_model=S.FundNavHistory)
def fund_nav_history(code: str):
    """基金历史净值。"""
    raise NotImplementedError("fund.navHistory 待实现")


@router.get("/fund/rank-history/{code}", response_model=S.FundRankHistory)
def fund_rank_history(code: str):
    """基金同类排名走势。"""
    raise NotImplementedError("fund.rankHistory 待实现")


@router.get("/fund/profile/{code}", response_model=S.FundProfile)
def fund_profile(code: str):
    """基金深度资料。"""
    raise NotImplementedError("fund.profile 待实现")


@router.get("/fund/theme/list", response_model=S.ThemeFundListResult)
def fund_theme_list(options: P.GetThemeListOptions = Depends()):
    """主题基金列表。"""
    raise NotImplementedError("fund.theme.getThemeList 待实现")


@router.get("/fund/theme/funds/{theme_code}", response_model=S.ThemeFundItemList)
def fund_theme_funds(theme_code: str, options: P.GetThemeFundsOptions = Depends()):
    """主题下基金列表。"""
    raise NotImplementedError("fund.theme.getThemeFunds 待实现")


# ===========================================================================
# 交易日历 / 市场状态 calendar
# ===========================================================================

@router.get("/calendar/is-trading-day")
def calendar_is_trading_day(date: Annotated[str | None, Query()] = None) -> bool:
    """判断是否 A 股交易日。"""
    raise NotImplementedError("calendar.isTradingDay 待实现")


@router.get("/calendar/next-trading-day")
def calendar_next_trading_day(date: Annotated[str | None, Query()] = None) -> str:
    """下一个交易日。"""
    raise NotImplementedError("calendar.nextTradingDay 待实现")


@router.get("/calendar/prev-trading-day")
def calendar_prev_trading_day(date: Annotated[str | None, Query()] = None) -> str:
    """上一个交易日。"""
    raise NotImplementedError("calendar.prevTradingDay 待实现")


@router.get("/calendar/market-status", response_model=MarketStatus)
def calendar_market_status(
    market: Annotated[P.SupportedMarket | None, Query()] = None,
    now: Annotated[str | None, Query()] = None,
) -> MarketStatus:
    """当前市场状态。"""
    raise NotImplementedError("calendar.marketStatus 待实现")


# ===========================================================================
# 参考数据 reference
# ===========================================================================

@router.get("/reference/dividend-detail/{symbol}", response_model=list[S.DividendDetail])
def reference_dividend_detail(symbol: str):
    """分红派送详情。"""
    raise NotImplementedError("reference.dividendDetail 待实现")


@router.get("/reference/trading-calendar", response_model=list[str])
def reference_trading_calendar():
    """交易日历原始数组。"""
    raise NotImplementedError("reference.tradingCalendar 待实现")


# ===========================================================================
# 搜索 search
# ===========================================================================

@router.get("/search", response_model=list[S.SearchResult])
def search(keyword: Annotated[str, Query()]):
    """模糊搜索股票/指数/基金等。"""
    raise NotImplementedError("search 待实现")
