"""
stock-sdk 请求参数模型（Pydantic）。

严格对齐 stock-sdk 各接口的 Options 入参（字段名、可空性、枚举取值），
作为 quant 数据源 API 的请求参数声明。仅声明不实现。

注：JS 回调类参数（如 `onProgress`）不属于可序列化入参，此处省略。
"""

from typing import Literal, Optional, Union

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# 枚举 / 字面量类型
# ---------------------------------------------------------------------------

# A 股市场/板块类型
AShareMarket = Literal["sh", "sz", "bj", "kc", "cy"]
# 美股市场
USMarket = Literal["NASDAQ", "NYSE", "AMEX"]
# 市场类型
MarketType = Literal["A", "HK", "US"]
# 支持的市场（getMarketStatus）
SupportedMarket = Literal["A", "HK", "US"]
# 期货交易所
FuturesExchange = Literal["SHFE", "DCE", "CZCE", "INE", "CFFEX", "GFEX"]
# 中金所股指期权产品
IndexOptionProduct = Literal["ho", "io", "mo"]
# ETF 期权品种
ETFOptionCate = Literal["50ETF", "300ETF", "500ETF", "科创50", "科创板50"]
# 资金方向
NorthboundDirection = Literal["north", "south"]
# 北向持股市场
NorthboundMarket = Literal["all", "shanghai", "shenzhen"]
# 北向持股排行查询周期
NorthboundRankPeriod = Literal[
    "today", "3day", "5day", "10day", "month", "quarter", "year"
]
# 涨停股池类型
ZTPoolType = Literal["zt", "yesterday", "strong", "sub_new", "broken", "dt"]
# 盘口异动类型
StockChangeType = Literal[
    "rocket_launch", "quick_rebound", "large_buy", "limit_up_seal",
    "limit_down_open", "big_buy_order", "auction_up", "high_open_5d",
    "gap_up", "high_60d", "surge_60d", "accelerate_down", "high_dive",
    "large_sell", "limit_down_seal", "limit_up_open", "big_sell_order",
    "auction_down", "low_open_5d", "gap_down", "low_60d", "drop_60d",
]
# 龙虎榜统计周期
DragonTigerPeriod = Literal["1month", "3month", "6month", "1year"]
# 基金分红查询排序字段
FundDividendRank = Literal["BZDM", "ABBNAME", "DJR", "FSRQ", "FHFCZ", "FFR"]
# 通用排序方向
FundSortDirection = Literal["asc", "desc"]
# 主题基金排序字段
ThemeFundSort = Literal[
    "ZDF", "SYL_W", "SYL_M", "SYL_3M", "SYL_6M", "SYL_Y", "SYL_3Y", "SYL_5Y"
]
# 主题基金排序方向
ThemeFundOrder = Literal["desc", "asc"]
# 主题基金类型筛选
ThemeCategory = Literal["0", "1", "2"]
# 主题基金排行排序字段
ThemeFundRankSort = Literal["SYL_Z", "SYL_Y", "SYL_3Y", "SYL_1N", "RZDF"]


# ---------------------------------------------------------------------------
# 技术指标配置
# ---------------------------------------------------------------------------

class MAOptions(BaseModel):
    """均线配置。"""

    periods: list[float] | None = None
    type: Literal["sma", "ema", "wma"] | None = None
    decimals: float | None = None


class MACDOptions(BaseModel):
    """MACD 配置。"""

    short: float | None = None
    long: float | None = None
    signal: float | None = None
    decimals: float | None = None


class BOLLOptions(BaseModel):
    """BOLL 配置。"""

    period: float | None = None
    stdDev: float | None = None
    decimals: float | None = None


class KDJOptions(BaseModel):
    """KDJ 配置。"""

    period: float | None = None
    kPeriod: float | None = None
    dPeriod: float | None = None
    decimals: float | None = None


class RSIOptions(BaseModel):
    """RSI 配置。"""

    periods: list[float] | None = None
    decimals: float | None = None


class WROptions(BaseModel):
    """WR 配置。"""

    periods: list[float] | None = None
    decimals: float | None = None


class BIASOptions(BaseModel):
    """BIAS 配置。"""

    periods: list[float] | None = None
    decimals: float | None = None


class CCIOptions(BaseModel):
    """CCI 配置。"""

    period: float | None = None
    decimals: float | None = None


class ATROptions(BaseModel):
    """ATR 配置。"""

    period: float | None = None
    decimals: float | None = None


class OBVOptions(BaseModel):
    """OBV 配置。"""

    maPeriod: float | None = None


class ROCOptions(BaseModel):
    """ROC 配置。"""

    period: float | None = None
    signalPeriod: float | None = None


class DMIOptions(BaseModel):
    """DMI 配置。"""

    period: float | None = None
    adxPeriod: float | None = None


class SAROptions(BaseModel):
    """SAR 配置。"""

    afStart: float | None = None
    afIncrement: float | None = None
    afMax: float | None = None


class KCOptions(BaseModel):
    """KC 配置。"""

    emaPeriod: float | None = None
    atrPeriod: float | None = None
    multiplier: float | None = None


class IndicatorOptions(BaseModel):
    """指标配置（`KlineWithIndicatorsOptions.indicators`）。

    每个指标字段可为：具体配置对象、简写（周期数组 / `{period: n}` 的列表形式）、
    或布尔开关。此处用 Union 保留 SDK 的简写语义。
    """

    ma: MAOptions | list[float] | bool | None = None
    macd: MACDOptions | bool | None = None
    boll: BOLLOptions | bool | None = None
    kdj: KDJOptions | bool | None = None
    rsi: RSIOptions | list[float] | bool | None = None
    wr: WROptions | list[float] | bool | None = None
    bias: BIASOptions | list[float] | bool | None = None
    cci: CCIOptions | bool | None = None
    atr: ATROptions | bool | None = None
    obv: OBVOptions | bool | None = None
    roc: ROCOptions | bool | None = None
    dmi: DMIOptions | bool | None = None
    sar: SAROptions | bool | None = None
    kc: KCOptions | bool | None = None


# ---------------------------------------------------------------------------
# 代码列表 / 批量行情
# ---------------------------------------------------------------------------

class GetAShareCodeListOptions(BaseModel):
    """获取 A 股代码列表配置。"""

    simple: bool | None = None
    market: AShareMarket | None = None


class GetUSCodeListOptions(BaseModel):
    """获取美股代码列表配置。"""

    simple: bool | None = None
    market: USMarket | None = None


class GetAllAShareQuotesOptions(BaseModel):
    """获取全部 A 股行情配置（onProgress 回调省略）。"""

    batchSize: int | None = None
    concurrency: int | None = None
    market: AShareMarket | None = None


class GetAllHKQuotesOptions(BaseModel):
    """获取全部港股行情配置（onProgress 回调省略）。

    对齐 stock-sdk `GetAllHKQuotesOptions = Omit<GetAllAShareQuotesOptions, 'market'>`：
    港股只有一个交易所，故无 `market` 过滤字段。
    """

    batchSize: int | None = None
    concurrency: int | None = None


class GetAllUSQuotesOptions(BaseModel):
    """获取全部美股行情配置（onProgress 回调省略）。"""

    batchSize: int | None = None
    concurrency: int | None = None
    market: USMarket | None = None


# ---------------------------------------------------------------------------
# K 线 / 分时
# ---------------------------------------------------------------------------

class HistoryKlineOptions(BaseModel):
    """A 股历史 K 线选项。"""

    period: Literal["daily", "weekly", "monthly"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None


class MinuteKlineOptions(BaseModel):
    """A 股分钟 K 线选项。"""

    period: Literal["1", "5", "15", "30", "60"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None


class HKKlineOptions(BaseModel):
    """港股 K 线选项。"""

    period: Literal["daily", "weekly", "monthly"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None


class HKMinuteKlineOptions(BaseModel):
    """港股分钟 K 线选项。"""

    period: Literal["1", "5", "15", "30", "60"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None
    ndays: int | None = None


class USKlineOptions(BaseModel):
    """美股 K 线选项。"""

    period: Literal["daily", "weekly", "monthly"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None


class USMinuteKlineOptions(BaseModel):
    """美股分钟 K 线选项。"""

    period: Literal["1", "5", "15", "30", "60"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None
    ndays: int | None = None


class KlineWithIndicatorsOptions(BaseModel):
    """`kline.withIndicators` 请求参数。"""

    market: MarketType | None = None
    period: Literal["daily", "weekly", "monthly"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None
    indicators: IndicatorOptions | None = None
    leadingBars: int | None = None


class KlineSignalsOptions(BaseModel):
    """`kline.signals` 请求参数。"""

    market: MarketType | None = None
    period: Literal["daily", "weekly", "monthly"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None
    maFast: int | None = None
    maSlow: int | None = None


class ChipDistributionRequestOptions(BaseModel):
    """`chips.cn / hk / us` 请求参数。"""

    range: int | None = None
    includeHistogram: bool | Literal["last", "all"] | None = None
    decimals: int | None = None
    days: int | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None


# ---------------------------------------------------------------------------
# 板块
# ---------------------------------------------------------------------------

class BoardKlineOptions(BaseModel):
    """板块 K 线选项（行业 / 概念共用）。"""

    period: Literal["daily", "weekly", "monthly"] | None = None
    adjust: Literal["", "qfq", "hfq"] | None = None
    startDate: str | None = None
    endDate: str | None = None


class BoardMinuteKlineOptions(BaseModel):
    """板块分钟 K 线选项。"""

    period: Literal["1", "5", "15", "30", "60"] | None = None


# ---------------------------------------------------------------------------
# 期货
# ---------------------------------------------------------------------------

class FuturesKlineOptions(BaseModel):
    """期货 K 线选项。"""

    period: Literal["daily", "weekly", "monthly"] | None = None
    startDate: str | None = None
    endDate: str | None = None


class GlobalFuturesSpotOptions(BaseModel):
    """全球期货行情选项。"""

    pageSize: int | None = None


class GlobalFuturesKlineOptions(BaseModel):
    """全球期货 K 线选项。"""

    period: Literal["daily", "weekly", "monthly"] | None = None
    startDate: str | None = None
    endDate: str | None = None
    marketCode: int | None = None


class FuturesInventoryOptions(BaseModel):
    """期货库存数据选项。"""

    startDate: str | None = None
    pageSize: int | None = None


class ComexInventoryOptions(BaseModel):
    """COMEX 库存数据选项。"""

    pageSize: int | None = None


class CFFEXOptionQuotesOptions(BaseModel):
    """中金所期权实时行情列表选项。"""

    pageSize: int | None = None


# ---------------------------------------------------------------------------
# 资金流向
# ---------------------------------------------------------------------------

class FundFlowOptions(BaseModel):
    """资金流周期选项。"""

    period: Literal["daily", "weekly", "monthly"] | None = None


class FundFlowRankOptions(BaseModel):
    """资金流排名选项。"""

    indicator: Literal["today", "3day", "5day", "10day"] | None = None
    sectorType: Literal["industry", "concept", "region"] | None = None


# ---------------------------------------------------------------------------
# 沪深港通 / 北向
# ---------------------------------------------------------------------------

class NorthboundHoldingRankOptions(BaseModel):
    """北向持股排行选项。"""

    market: NorthboundMarket | None = None
    period: NorthboundRankPeriod | None = None
    date: str | None = None


class NorthboundHistoryOptions(BaseModel):
    """北向资金历史 / 个股持仓选项。"""

    startDate: str | None = None
    endDate: str | None = None


# ---------------------------------------------------------------------------
# 龙虎榜 / 大宗交易
# ---------------------------------------------------------------------------

class DragonTigerDateOptions(BaseModel):
    """龙虎榜日期范围参数。"""

    startDate: str
    endDate: str


class BlockTradeDateOptions(BaseModel):
    """大宗交易日期范围参数。"""

    startDate: str | None = None
    endDate: str | None = None


# ---------------------------------------------------------------------------
# 盘口异动
# ---------------------------------------------------------------------------

class IndividualChangesOptions(BaseModel):
    """`marketEvent.individualChanges` 请求参数。"""

    date: str | None = None


class IndividualChangesHistoryOptions(BaseModel):
    """`marketEvent.individualChangesHistory` 请求参数。"""

    days: int | None = None


# ---------------------------------------------------------------------------
# 基金
# ---------------------------------------------------------------------------

class FundDividendListOptions(BaseModel):
    """基金分红查询选项。"""

    year: int | str | None = None
    page: int | Literal["all"] | None = None
    fundType: str | None = None
    rank: FundDividendRank | None = None
    sort: FundSortDirection | None = None
    code: str | None = None


class GetThemeListOptions(BaseModel):
    """获取主题列表选项。"""

    sort: ThemeFundSort | None = None
    order: ThemeFundOrder | None = None
    category: ThemeCategory | None = None
    pageSize: int | None = None
    page: int | None = None


class GetHotThemesOptions(BaseModel):
    """获取热门主题选项。"""

    sort: ThemeFundSort | None = None
    order: ThemeFundOrder | None = None
    category: ThemeCategory | None = None
    limit: int | None = None


class GetThemeFundsOptions(BaseModel):
    """获取主题下基金选项。"""

    sortColumn: ThemeFundRankSort | None = None
    sort: ThemeFundOrder | None = None
    page: int | None = None
    pageSize: int | None = None
    fundType: str | None = None
