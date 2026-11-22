"""固定跨资产标的目录。"""
from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal, Mapping


MarketAssetKind = Literal[
    "a_share_index",
    "a_share_etf",
    "spot_gold",
    "global_index",
]
MarketAssetSession = Literal["a_share", "global_gold", "us_equity"]


@dataclass(frozen=True, slots=True)
class MarketAssetDefinition:
    symbol: str
    name: str
    kind: MarketAssetKind
    currency: Literal["CNY", "USD"]
    price_unit: str
    provider_symbol: str
    session: MarketAssetSession
    has_volume: bool
    display_timezone: str = "Asia/Shanghai"


MARKET_ASSETS: Mapping[str, MarketAssetDefinition] = MappingProxyType(
    {
        "000001.SH": MarketAssetDefinition(
            symbol="000001.SH",
            name="上证指数",
            kind="a_share_index",
            currency="CNY",
            price_unit="点",
            provider_symbol="sh000001",
            session="a_share",
            has_volume=True,
        ),
        "399006.SZ": MarketAssetDefinition(
            symbol="399006.SZ",
            name="创业板指",
            kind="a_share_index",
            currency="CNY",
            price_unit="点",
            provider_symbol="sz399006",
            session="a_share",
            has_volume=True,
        ),
        "510300.SH": MarketAssetDefinition(
            symbol="510300.SH",
            name="沪深300ETF",
            kind="a_share_etf",
            currency="CNY",
            price_unit="元",
            provider_symbol="sh510300",
            session="a_share",
            has_volume=True,
        ),
        "588000.SH": MarketAssetDefinition(
            symbol="588000.SH",
            name="科创50ETF",
            kind="a_share_etf",
            currency="CNY",
            price_unit="元",
            provider_symbol="sh588000",
            session="a_share",
            has_volume=True,
        ),
        "159992.SZ": MarketAssetDefinition(
            symbol="159992.SZ",
            name="创新药ETF",
            kind="a_share_etf",
            currency="CNY",
            price_unit="元",
            provider_symbol="sz159992",
            session="a_share",
            has_volume=True,
        ),
        "XAUUSD": MarketAssetDefinition(
            symbol="XAUUSD",
            name="伦敦金",
            kind="spot_gold",
            currency="USD",
            price_unit="USD/oz",
            provider_symbol="hf_XAU",
            session="global_gold",
            has_volume=False,
        ),
        "IXIC": MarketAssetDefinition(
            symbol="IXIC",
            name="纳斯达克综合指数",
            kind="global_index",
            currency="USD",
            price_unit="点",
            provider_symbol="usIXIC",
            session="us_equity",
            has_volume=False,
        ),
    }
)


def resolve_market_asset(symbol: str) -> MarketAssetDefinition:
    normalized = symbol.strip().upper()
    try:
        return MARKET_ASSETS[normalized]
    except KeyError:
        raise ValueError(f"unknown market asset: {symbol}") from None
