"""
stock-sdk 返回数据模型（Pydantic）。

严格对齐 stock-sdk 各接口的返回结构（字段名、可空性、判别字段均一致），
作为 quant 数据源 API 的响应声明。此处仅定义数据结构，不做任何实现，
供后续切换数据源时直接复用同一套响应契约。

字段命名遵循 stock-sdk 的 camelCase 约定，序列化输出与 SDK 完全一致，
避免下游（前端 / agent）在切换数据源后需要改动字段名。

数值字段统一映射：
- TS `number`       -> `float`（或语义明确的 `int`）
- TS `number | null` -> `float | None`
- TS 枚举 / 判别字面量 -> `Literal[...]`
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# 通用字面量类型
# ---------------------------------------------------------------------------

# 数据源 provider（stock-sdk `ProviderName`）
ProviderName = Literal["tencent", "eastmoney", "sina", "linkdiary", "unknown"]

# 市场时区（stock-sdk `MarketTz`）
MarketTz = Literal["Asia/Shanghai", "Asia/Hong_Kong", "America/New_York"]

# 信号类型（stock-sdk `SignalType`，14 种）
SignalType = Literal[
    "ma_golden_cross",
    "ma_death_cross",
    "macd_golden_cross",
    "macd_death_cross",
    "kdj_golden_cross",
    "kdj_death_cross",
    "kdj_overbought",
    "kdj_oversold",
    "rsi_overbought",
    "rsi_oversold",
    "boll_break_upper",
    "boll_break_lower",
    "sar_reversal_up",
    "sar_reversal_down",
]


# ---------------------------------------------------------------------------
# 行情
# ---------------------------------------------------------------------------

class BidAskLevel(BaseModel):
    """五档盘口的一档（买/卖）。"""

    price: float
    volume: float


class FullQuote(BaseModel):
    """A 股 / 指数全量行情。"""

    marketId: str
    name: str
    code: str
    price: float
    prevClose: float
    open: float
    volume: float
    outerVolume: float
    innerVolume: float
    bid: list[BidAskLevel]
    ask: list[BidAskLevel]
    time: str
    timestamp: float | None
    tz: MarketTz
    change: float
    changePercent: float
    high: float
    low: float
    volume2: float
    amount: float
    turnoverRate: float | None
    pe: float | None
    amplitude: float | None
    circulatingMarketCap: float | None
    totalMarketCap: float | None
    pb: float | None
    limitUp: float | None
    limitDown: float | None
    volumeRatio: float | None
    avgPrice: float | None
    peStatic: float | None
    peDynamic: float | None
    high52w: float | None
    low52w: float | None
    circulatingShares: float | None
    totalShares: float | None
    market: Literal["CN"]
    assetType: Literal["stock"]
    source: ProviderName


class SimpleQuote(BaseModel):
    """简要行情（股票 / 指数）。"""

    marketId: str
    name: str
    code: str
    price: float
    change: float
    changePercent: float
    volume: float
    amount: float
    marketCap: float | None
    marketType: str
    market: Literal["CN"]
    assetType: Literal["stock"]
    source: ProviderName


class FundFlow(BaseModel):
    """个股实时资金流向。"""

    code: str
    mainInflow: float
    mainOutflow: float
    mainNet: float
    mainNetRatio: float
    retailInflow: float
    retailOutflow: float
    retailNet: float
    retailNetRatio: float
    totalFlow: float
    name: str
    date: str
    timestamp: float | None
    tz: MarketTz


class PanelLargeOrder(BaseModel):
    """盘口大单占比。"""

    buyLargeRatio: float
    buySmallRatio: float
    sellLargeRatio: float
    sellSmallRatio: float


class HKQuote(BaseModel):
    """港股扩展行情。"""

    marketId: str
    name: str
    code: str
    price: float
    prevClose: float
    open: float
    volume: float
    time: str
    timestamp: float | None
    tz: MarketTz
    change: float
    changePercent: float
    high: float
    low: float
    amount: float
    lotSize: float | None
    circulatingMarketCap: float | None
    totalMarketCap: float | None
    currency: str
    market: Literal["HK"]
    assetType: Literal["stock", "index"]
    source: ProviderName


class USQuote(BaseModel):
    """美股行情。"""

    marketId: str
    name: str
    code: str
    price: float
    prevClose: float
    open: float
    volume: float
    time: str
    timestamp: float | None
    tz: MarketTz
    change: float
    changePercent: float
    high: float
    low: float
    amount: float
    turnoverRate: float | None
    pe: float | None
    amplitude: float | None
    totalMarketCap: float | None
    pb: float | None
    high52w: float | None
    low52w: float | None
    market: Literal["US"]
    assetType: Literal["stock", "index"]
    source: ProviderName


class FundQuote(BaseModel):
    """公募基金行情。"""

    code: str
    name: str
    nav: float
    accNav: float
    change: float
    navDate: str
    timestamp: float | None
    tz: MarketTz
    market: Literal["CN"]
    assetType: Literal["fund"]
    source: ProviderName


# ---------------------------------------------------------------------------
# K 线 / 分时
# ---------------------------------------------------------------------------

class HistoryKline(BaseModel):
    """A 股历史 K 线（日/周/月）。"""

    date: str
    timestamp: float | None
    tz: MarketTz
    code: str
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None


class MinuteTimeline(BaseModel):
    """A 股分时数据（1 分钟）。"""

    time: str
    timestamp: float | None
    tz: MarketTz
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    avgPrice: float | None


class MinuteKline(BaseModel):
    """A 股分钟 K 线（5/15/30/60）。"""

    time: str
    timestamp: float | None
    tz: MarketTz
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None


class TodayTimeline(BaseModel):
    """当日分时项。"""

    time: str
    timestamp: float | None
    tz: MarketTz
    price: float
    avgPrice: float
    volume: float
    amount: float


class TodayTimelineResponse(BaseModel):
    """当日分时响应。"""

    code: str
    date: str
    timestamp: float | None
    tz: MarketTz
    preClose: float | None = None
    data: list[TodayTimeline]


class HKHistoryKline(BaseModel):
    """港股历史 K 线。"""

    date: str
    timestamp: float | None
    code: str
    name: str
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None
    tz: MarketTz
    currency: Literal["HKD"]
    lotSize: float | None


class USHistoryKline(BaseModel):
    """美股历史 K 线。"""

    date: str
    timestamp: float | None
    code: str
    name: str
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None
    tz: MarketTz
    currency: Literal["USD"]


class HKMinuteKline(BaseModel):
    """港股分钟 K 线。"""

    time: str
    timestamp: float | None
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None
    tz: MarketTz
    currency: Literal["HKD"]
    code: str


class HKMinuteTimeline(BaseModel):
    """港股当日分时。"""

    time: str
    timestamp: float | None
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    avgPrice: float | None
    tz: MarketTz
    currency: Literal["HKD"]
    code: str


class USMinuteKline(BaseModel):
    """美股分钟 K 线。"""

    time: str
    timestamp: float | None
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None
    tz: MarketTz
    currency: Literal["USD"]
    code: str


class USMinuteTimeline(BaseModel):
    """美股当日分时。"""

    time: str
    timestamp: float | None
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    avgPrice: float | None
    tz: MarketTz
    currency: Literal["USD"]
    code: str


class KlineSignal(BaseModel):
    """一条识别出的指标信号。"""

    type: SignalType
    date: str
    timestamp: float
    close: float | None
    detail: dict[str, float] | None = None


# ---------------------------------------------------------------------------
# 技术指标结果（KlineWithIndicators 的可选字段）
# ---------------------------------------------------------------------------

class MACDResult(BaseModel):
    dif: float | None
    dea: float | None
    macd: float | None


class BOLLResult(BaseModel):
    mid: float | None
    upper: float | None
    lower: float | None
    bandwidth: float | None


class KDJResult(BaseModel):
    k: float | None
    d: float | None
    j: float | None


class CCIResult(BaseModel):
    cci: float | None


class ATRResult(BaseModel):
    tr: float | None
    atr: float | None


class OBVResult(BaseModel):
    obv: float | None
    obvMa: float | None


class ROCResult(BaseModel):
    roc: float | None
    signal: float | None


class DMIResult(BaseModel):
    pdi: float | None
    mdi: float | None
    adx: float | None
    adxr: float | None


class SARResult(BaseModel):
    sar: float | None
    trend: Literal[1, -1] | None
    ep: float | None
    af: float | None


class KCResult(BaseModel):
    mid: float | None
    upper: float | None
    lower: float | None
    width: float | None


class KlineWithIndicators(HistoryKline):
    """带技术指标的 A 股 K 线（HistoryKline 字段 + 可选指标）。"""

    ma: dict[str, float | None] | None = None
    macd: MACDResult | None = None
    boll: BOLLResult | None = None
    kdj: KDJResult | None = None
    rsi: dict[str, float | None] | None = None
    wr: dict[str, float | None] | None = None
    bias: dict[str, float | None] | None = None
    cci: CCIResult | None = None
    atr: ATRResult | None = None
    obv: OBVResult | None = None
    roc: ROCResult | None = None
    dmi: DMIResult | None = None
    sar: SARResult | None = None
    kc: KCResult | None = None


# ---------------------------------------------------------------------------
# 板块（行业 / 概念）
# ---------------------------------------------------------------------------

class IndustryBoard(BaseModel):
    """行业板块列表项（概念板块复用此结构）。"""

    rank: int
    name: str
    code: str
    price: float | None
    change: float | None
    changePercent: float | None
    totalMarketCap: float | None
    turnoverRate: float | None
    riseCount: int | None
    fallCount: int | None
    leadingStock: str | None
    leadingStockChangePercent: float | None


class IndustryBoardSpot(BaseModel):
    """行业板块实时行情指标。"""

    item: str
    value: float | None


class IndustryBoardConstituent(BaseModel):
    """行业板块成分股。"""

    rank: int
    code: str
    name: str
    price: float | None
    changePercent: float | None
    change: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    high: float | None
    low: float | None
    open: float | None
    prevClose: float | None
    turnoverRate: float | None
    pe: float | None
    pb: float | None


class IndustryBoardKline(BaseModel):
    """行业板块历史 K 线。"""

    date: str
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None


class IndustryBoardMinuteTimeline(BaseModel):
    """行业板块 1 分钟分时。"""

    time: str
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    price: float | None


class IndustryBoardMinuteKline(BaseModel):
    """行业板块分钟 K 线（5/15/30/60）。"""

    time: str
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None


# 概念板块结构复用行业板块
ConceptBoard = IndustryBoard
ConceptBoardSpot = IndustryBoardSpot
ConceptBoardConstituent = IndustryBoardConstituent
ConceptBoardKline = IndustryBoardKline
ConceptBoardMinuteTimeline = IndustryBoardMinuteTimeline
ConceptBoardMinuteKline = IndustryBoardMinuteKline


# ---------------------------------------------------------------------------
# 期货
# ---------------------------------------------------------------------------

class FuturesKline(BaseModel):
    """期货 K 线。"""

    date: str
    code: str
    name: str
    open: float | None
    close: float | None
    high: float | None
    low: float | None
    volume: float | None
    amount: float | None
    amplitude: float | None
    changePercent: float | None
    change: float | None
    turnoverRate: float | None
    openInterest: float | None


class GlobalFuturesQuote(BaseModel):
    """全球期货实时报价。"""

    code: str
    name: str
    price: float | None
    change: float | None
    changePercent: float | None
    open: float | None
    high: float | None
    low: float | None
    prevSettle: float | None
    volume: float | None
    buyVolume: float | None
    sellVolume: float | None
    openInterest: float | None


class FuturesInventorySymbol(BaseModel):
    """期货库存品种。"""

    code: str
    name: str
    marketCode: str


class FuturesInventory(BaseModel):
    """期货库存数据。"""

    code: str
    date: str
    inventory: float | None
    change: float | None


class ComexInventory(BaseModel):
    """COMEX 库存数据。"""

    date: str
    name: str
    storageTon: float | None
    storageOunce: float | None


# ---------------------------------------------------------------------------
# 期权
# ---------------------------------------------------------------------------

class OptionTQuote(BaseModel):
    """期权 T 型报价项。"""

    symbol: str
    buyVolume: float | None
    buyPrice: float | None
    price: float | None
    askPrice: float | None
    askVolume: float | None
    openInterest: float | None
    change: float | None
    strikePrice: float | None


class OptionTQuoteResult(BaseModel):
    """期权 T 型报价结果。"""

    calls: list[OptionTQuote]
    puts: list[OptionTQuote]


class OptionKline(BaseModel):
    """期权日 K 线。"""

    date: str
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: float | None


class OptionMinute(BaseModel):
    """期权分钟数据。"""

    time: str
    date: str
    price: float | None
    volume: float | None
    openInterest: float | None
    avgPrice: float | None


class ETFOptionMonth(BaseModel):
    """ETF 期权月份信息。"""

    months: list[str]
    stockId: str
    cateId: str
    cateList: list[str]


class ETFOptionExpireDay(BaseModel):
    """ETF 期权到期信息。"""

    expireDay: str
    remainderDays: int
    stockId: str
    name: str


class CFFEXOptionQuote(BaseModel):
    """中金所期权实时行情。"""

    code: str
    name: str
    price: float | None
    change: float | None
    changePercent: float | None
    volume: float | None
    amount: float | None
    openInterest: float | None
    strikePrice: float | None
    remainDays: float | None
    dailyChange: float | None
    prevSettle: float | None
    open: float | None


class OptionLHBItem(BaseModel):
    """期权龙虎榜项。"""

    tradeType: str
    date: str
    symbol: str
    targetName: str
    rank: int
    memberName: str
    sellVolume: float | None
    sellVolumeChange: float | None
    netSellVolume: float | None
    sellVolumeRatio: float | None
    buyVolume: float | None
    buyVolumeChange: float | None
    netBuyVolume: float | None
    buyVolumeRatio: float | None
    sellPosition: float | None
    sellPositionChange: float | None
    netSellPosition: float | None
    sellPositionRatio: float | None
    buyPosition: float | None
    buyPositionChange: float | None
    netBuyPosition: float | None
    buyPositionRatio: float | None


# ---------------------------------------------------------------------------
# 搜索 / 参考数据
# ---------------------------------------------------------------------------

class SearchResult(BaseModel):
    """搜索结果。"""

    code: str
    name: str
    market: str
    type: str
    category: Literal["stock", "index", "fund", "bond", "futures", "option", "other"] | None = None


class ExternalLink(BaseModel):
    """外部财经站点链接。"""

    name: str
    url: str


class DividendDetail(BaseModel):
    """分红派送详情。"""

    code: str
    name: str
    reportDate: str | None
    planNoticeDate: str | None
    disclosureDate: str | None
    assignTransferRatio: float | None
    bonusRatio: float | None
    transferRatio: float | None
    dividendPretax: float | None
    dividendDesc: str | None
    dividendYield: float | None
    eps: float | None
    bps: float | None
    capitalReserve: float | None
    unassignedProfit: float | None
    netProfitYoy: float | None
    totalShares: float | None
    equityRecordDate: str | None
    exDividendDate: str | None
    payDate: str | None
    assignProgress: str | None
    noticeDate: str | None


# ---------------------------------------------------------------------------
# 资金流向（深度）
# ---------------------------------------------------------------------------

class StockFundFlowDaily(BaseModel):
    """个股资金流（日/周/月线）。"""

    date: str
    close: float | None
    changePercent: float | None
    mainNetInflow: float | None
    mainNetInflowPercent: float | None
    superLargeNetInflow: float | None
    superLargeNetInflowPercent: float | None
    largeNetInflow: float | None
    largeNetInflowPercent: float | None
    mediumNetInflow: float | None
    mediumNetInflowPercent: float | None
    smallNetInflow: float | None
    smallNetInflowPercent: float | None


class FundFlowRankItem(BaseModel):
    """个股资金流排名项。"""

    code: str
    name: str
    price: float | None
    changePercent: float | None
    mainNetInflow: float | None
    mainNetInflowPercent: float | None
    superLargeNetInflow: float | None
    superLargeNetInflowPercent: float | None
    largeNetInflow: float | None
    largeNetInflowPercent: float | None
    mediumNetInflow: float | None
    mediumNetInflowPercent: float | None
    smallNetInflow: float | None
    smallNetInflowPercent: float | None


class SectorFundFlowItem(BaseModel):
    """板块资金流排名项。"""

    code: str
    name: str
    changePercent: float | None
    mainNetInflow: float | None
    mainNetInflowPercent: float | None
    superLargeNetInflow: float | None
    largeNetInflow: float | None
    mediumNetInflow: float | None
    smallNetInflow: float | None
    topStockName: str | None = None
    topStockCode: str | None = None


class MarketFundFlow(BaseModel):
    """大盘资金流（按日）。"""

    date: str
    shClose: float | None
    shChangePercent: float | None
    szClose: float | None
    szChangePercent: float | None
    mainNetInflow: float | None
    mainNetInflowPercent: float | None
    superLargeNetInflow: float | None
    superLargeNetInflowPercent: float | None
    largeNetInflow: float | None
    largeNetInflowPercent: float | None
    mediumNetInflow: float | None
    mediumNetInflowPercent: float | None
    smallNetInflow: float | None
    smallNetInflowPercent: float | None


# ---------------------------------------------------------------------------
# 沪深港通 / 北向资金
# ---------------------------------------------------------------------------

class NorthboundMinuteItem(BaseModel):
    """北向 / 南向资金分时数据。"""

    date: str
    time: str
    shanghaiNetInflow: float | None
    shenzhenNetInflow: float | None
    totalNetInflow: float | None


class NorthboundFlowSummary(BaseModel):
    """沪深港通市场资金流向汇总。"""

    date: str
    type: str
    boardName: str
    direction: str
    status: str
    netBuyAmount: float | None
    netInflow: float | None
    remainAmount: float | None
    upCount: int | None
    flatCount: int | None
    downCount: int | None
    indexCode: str
    indexName: str
    indexChangePercent: float | None


class NorthboundHoldingRankItem(BaseModel):
    """北向 / 沪股通 / 深股通持股个股排行项。"""

    date: str
    code: str
    name: str
    close: float | None
    changePercent: float | None
    holdShares: float | None
    holdMarketValue: float | None
    holdRatioFloat: float | None
    holdRatioTotal: float | None
    addShares: float | None
    addMarketValue: float | None
    addMarketValuePercent: float | None
    sector: str


class NorthboundHistoryItem(BaseModel):
    """北向资金历史项（按日）。"""

    date: str
    netBuyAmount: float | None
    buyAmount: float | None
    sellAmount: float | None
    accNetBuyAmount: float | None
    netInflow: float | None
    remainAmount: float | None
    topStockCode: str | None
    topStockName: str | None
    topStockChangePercent: float | None


class NorthboundIndividualItem(BaseModel):
    """个股北向持仓历史项。"""

    date: str
    holdShares: float | None
    holdMarketValue: float | None
    holdRatioFloat: float | None
    holdRatioTotal: float | None
    close: float | None
    changePercent: float | None


# ---------------------------------------------------------------------------
# 涨停板 / 盘口异动
# ---------------------------------------------------------------------------

class ZTPoolItem(BaseModel):
    """涨停股池项。"""

    code: str
    name: str
    price: float | None
    changePercent: float | None
    limitPrice: float | None
    amount: float | None
    floatMarketValue: float | None
    totalMarketValue: float | None
    turnoverRate: float | None
    continuousBoardCount: int | None
    firstBoardTime: str | None
    lastBoardTime: str | None
    boardAmount: float | None
    sealAmount: float | None
    failedCount: int | None
    industry: str
    ztStatistics: str
    amplitude: float | None
    speed: float | None


class StockChangeItem(BaseModel):
    """盘口异动项。"""

    time: str
    code: str
    name: str
    changeType: str
    typeCode: str
    changeTypeLabel: str
    info: str


class IndividualStockChangeItem(BaseModel):
    """个股盘口异动事件。"""

    time: str
    typeCode: str
    changeType: str
    changeTypeLabel: str
    price: float | None
    changePercent: float | None
    info: str
    v: float | None


class IndividualChangesDay(BaseModel):
    """个股单个交易日的异动数据。"""

    date: str
    available: bool
    code: str
    name: str
    changes: list[IndividualStockChangeItem]


class ChangeTypeCount(BaseModel):
    """单个异动类型的计数。"""

    count: int
    label: str


class IndividualChangesCoverage(BaseModel):
    """个股异动历史覆盖情况。"""

    from_: str = Field(alias="from")
    to: str
    availableFrom: str | None


class IndividualChangesHistory(BaseModel):
    """个股近 N 天异动历史。"""

    code: str
    name: str
    requestedDays: int
    coverage: IndividualChangesCoverage
    days: list[IndividualChangesDay]
    stats: dict[str, ChangeTypeCount]


class BoardChangeItem(BaseModel):
    """板块异动项。"""

    name: str
    changePercent: float | None
    mainNetInflow: float | None
    totalChangeCount: int | None
    topStockCode: str
    topStockName: str
    topStockDirection: str
    changeTypeDistribution: dict[str, int]


# ---------------------------------------------------------------------------
# 龙虎榜
# ---------------------------------------------------------------------------

class DragonTigerDetailItem(BaseModel):
    """龙虎榜详情项。"""

    code: str
    name: str
    date: str
    close: float | None
    changePercent: float | None
    netBuyAmount: float | None
    buyAmount: float | None
    sellAmount: float | None
    dealAmount: float | None
    totalAmount: float | None
    netBuyRatio: float | None
    dealAmountRatio: float | None
    turnoverRate: float | None
    floatMarketValue: float | None
    reason: str
    afterChange1d: float | None
    afterChange2d: float | None
    afterChange5d: float | None
    afterChange10d: float | None


class DragonTigerStockStatItem(BaseModel):
    """龙虎榜个股上榜统计项。"""

    code: str
    name: str
    latestDate: str
    close: float | None
    changePercent: float | None
    count: int | None
    totalBuyAmount: float | None
    totalSellAmount: float | None
    totalNetAmount: float | None
    totalDealAmount: float | None
    buyOrgCount: int | None
    sellOrgCount: int | None


class DragonTigerInstitutionItem(BaseModel):
    """龙虎榜机构买卖项。"""

    code: str
    name: str
    date: str
    close: float | None
    changePercent: float | None
    buyOrgCount: int | None
    sellOrgCount: int | None
    orgBuyAmount: float | None
    orgSellAmount: float | None
    orgNetAmount: float | None


class DragonTigerBranchItem(BaseModel):
    """龙虎榜营业部排行项。"""

    code: str
    name: str
    totalBuyAmount: float | None
    totalSellAmount: float | None
    buyCount: int | None
    sellCount: int | None
    totalCount: int | None


class DragonTigerSeatItem(BaseModel):
    """龙虎榜个股席位明细项。"""

    rank: int | None
    branchName: str
    buyAmount: float | None
    buyAmountRatio: float | None
    sellAmount: float | None
    sellAmountRatio: float | None
    netAmount: float | None
    side: Literal["buy", "sell"]


# ---------------------------------------------------------------------------
# 大宗交易
# ---------------------------------------------------------------------------

class BlockTradeMarketStatItem(BaseModel):
    """大宗交易市场统计项（按日）。"""

    date: str
    shClose: float | None
    shChangePercent: float | None
    totalAmount: float | None
    premiumAmount: float | None
    premiumRatio: float | None
    discountAmount: float | None
    discountRatio: float | None


class BlockTradeDetailItem(BaseModel):
    """大宗交易明细项。"""

    code: str
    name: str
    date: str
    close: float | None
    changePercent: float | None
    dealPrice: float | None
    dealVolume: float | None
    dealAmount: float | None
    premiumRate: float | None
    buyBranch: str
    sellBranch: str


class BlockTradeDailyStatItem(BaseModel):
    """大宗交易每日统计项（按股票汇总）。"""

    code: str
    name: str
    date: str
    changePercent: float | None
    close: float | None
    dealCount: int | None
    dealTotalAmount: float | None
    dealTotalVolume: float | None
    premiumAmount: float | None
    discountAmount: float | None


# ---------------------------------------------------------------------------
# 融资融券
# ---------------------------------------------------------------------------

class MarginAccountItem(BaseModel):
    """融资融券账户统计项（按日）。"""

    date: str
    finBalance: float | None
    loanBalance: float | None
    finBuyAmount: float | None
    loanSellAmount: float | None
    investorCount: int | None
    liabilityInvestorCount: int | None
    totalGuarantee: float | None
    avgGuaranteeRatio: float | None


class MarginTargetItem(BaseModel):
    """融资融券标的证券项。"""

    code: str
    name: str
    date: str
    finBalance: float | None
    finBuyAmount: float | None
    finRepayAmount: float | None
    loanBalance: float | None
    loanSellVolume: float | None
    loanRepayVolume: float | None


# ---------------------------------------------------------------------------
# 公募基金扩展
# ---------------------------------------------------------------------------

class FundDividend(BaseModel):
    """一条基金分红记录。"""

    code: str
    name: str
    equityRecordDate: str | None
    exDividendDate: str | None
    dividendPerShare: float | None
    payDate: str | None
    dividendType: str | None


class FundDividendListResult(BaseModel):
    """基金分红查询结果。"""

    items: list[FundDividend]
    totalPages: int
    pageSize: int
    currentPage: int


class FundNavPoint(BaseModel):
    """单条历史净值点。"""

    date: str
    timestamp: float | None
    nav: float | None
    accNav: float | None
    dailyReturn: float | None
    unitMoney: str


class FundNavHistory(BaseModel):
    """基金历史净值查询结果。"""

    code: str
    name: str | None
    items: list[FundNavPoint]


class FundRankPoint(BaseModel):
    """单条同类排名点。"""

    date: str
    timestamp: float | None
    rank: int | None
    total: int | None
    percentile: float | None


class FundRankHistory(BaseModel):
    """基金同类排名走势查询结果。"""

    code: str
    name: str | None
    items: list[FundRankPoint]


class FundHolding(BaseModel):
    """前十大重仓股。"""

    code: str
    marketId: str


class FundBondHolding(BaseModel):
    """前五大债券持仓。"""

    code: str
    marketId: str


class FundAssetAllocation(BaseModel):
    """资产配置项（单季度）。"""

    date: str
    timestamp: float | None
    stockRatio: float
    bondRatio: float
    cashRatio: float
    otherRatio: float
    netAsset: float


class FundPositionPoint(BaseModel):
    """股票仓位测算点（每日）。"""

    date: str
    timestamp: float
    position: float


class FundPerformanceEvaluation(BaseModel):
    """业绩评价。"""

    overall: float
    categories: list[str]
    scores: list[float]
    descriptions: list[str]


class FundManager(BaseModel):
    """基金经理信息。"""

    id: str
    name: str
    avatarUrl: str | None
    star: float | None
    workTime: str | None
    fundSize: str | None
    power: Optional["FundPerformanceEvaluation"] = None


class FundHolderStructure(BaseModel):
    """持有人结构（单期）。"""

    date: str
    timestamp: float | None
    institutionRatio: float
    individualRatio: float
    internalRatio: float


class FundScaleChange(BaseModel):
    """规模变动（单季度）。"""

    date: str
    scale: float
    mom: str


class FundBuySedemption(BaseModel):
    """申购赎回（单季度）。"""

    date: str
    timestamp: float | None
    buy: float
    sell: float
    total: float


class FundStageReturns(BaseModel):
    """阶段收益率。"""

    oneMonth: float | None
    threeMonth: float | None
    sixMonth: float | None
    oneYear: float | None


class FundSameTypePeer(BaseModel):
    """同类基金中的一只。"""

    code: str
    name: str
    value: float | None


class FundSameType(BaseModel):
    """同类基金。"""

    groups: list[list[FundSameTypePeer]]


class FundProfile(BaseModel):
    """基金深度资料。"""

    code: str
    name: str | None
    sourceRate: float | None
    rate: float | None
    minSubscription: float | None
    holdings: list[FundHolding]
    bondHoldings: list[FundBondHolding]
    assetAllocation: list[FundAssetAllocation]
    positions: list[FundPositionPoint]
    managers: list[FundManager]
    performance: FundPerformanceEvaluation | None
    holderStructure: list[FundHolderStructure]
    scaleChanges: list[FundScaleChange]
    buySedemption: list[FundBuySedemption]
    stageReturns: FundStageReturns
    sameType: FundSameType | None


class ThemeFund(BaseModel):
    """主题基金条目（主题列表 / 热门主题）。"""

    code: str
    name: str
    dailyChange: float | None
    weeklyReturn: float | None
    monthlyReturn: float | None
    quarterlyReturn: float | None
    halfYearReturn: float | None
    yearlyReturn: float | None
    threeYearReturn: float | None
    fiveYearReturn: float | None
    type: Literal["行业", "概念"]


class ThemeFundListResult(BaseModel):
    """主题基金列表结果。"""

    items: list[ThemeFund]
    totalPages: int
    pageSize: int
    currentPage: int


class ThemeFundItem(BaseModel):
    """主题下基金条目。"""

    code: str
    name: str
    fundType: str
    dailyChange: float | None
    weeklyReturn: float | None
    monthlyReturn: float | None
    quarterlyReturn: float | None
    yearlyReturn: float | None
    nav: float | None
    themeCode: str
    themeName: str | None = None


class ThemeFundItemList(BaseModel):
    """主题下基金列表结果。"""

    items: list[ThemeFundItem]
    total: int
    pageIndex: int
    pageSize: int


# ---------------------------------------------------------------------------
# 筹码分布
# ---------------------------------------------------------------------------

class ChipHistogram(BaseModel):
    """筹码峰直方图。"""

    prices: list[float]
    ratios: list[float]


class ChipDistributionItem(BaseModel):
    """单日筹码分布统计。"""

    date: str
    profitRatio: float | None
    avgCost: float | None
    cost90Low: float | None
    cost90High: float | None
    concentration90: float | None
    cost70Low: float | None
    cost70High: float | None
    concentration70: float | None
    histogram: ChipHistogram | None = None
