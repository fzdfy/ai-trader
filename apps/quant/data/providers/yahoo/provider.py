"""Yahoo Finance 跨市场指数时序。"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from ...base import (
    CAPABILITY_MARKET_ASSET_DAILY,
    CAPABILITY_MARKET_ASSET_MINUTE,
    MarketProvider,
)
from ...common import MARKET_TZ, UA, norm_date
from ...schemas import MarketAssetBar

_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC"


def parse_yahoo_market_asset_bars(
    payload: dict, symbol: str, tf: str
) -> list[MarketAssetBar]:
    """解析 Yahoo chart 响应；session_date 使用交易所本地日期。"""
    try:
        result = payload["chart"]["result"][0]
        meta = result["meta"]
        quote = result["indicators"]["quote"][0]
        timestamps = result["timestamp"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(f"Yahoo {symbol} 时序响应格式异常") from None
    exchange_tz = ZoneInfo(meta.get("exchangeTimezoneName") or "America/New_York")
    bars: list[MarketAssetBar] = []
    for index, timestamp in enumerate(timestamps):
        try:
            open_price = quote["open"][index]
            high = quote["high"][index]
            low = quote["low"][index]
            close = quote["close"][index]
        except (KeyError, IndexError, TypeError):
            continue
        if None in (open_price, high, low, close):
            continue
        bucket_start = datetime.fromtimestamp(float(timestamp), tz=timezone.utc)
        session_date = bucket_start.astimezone(exchange_tz).date()
        bars.append(
            MarketAssetBar(
                symbol=symbol,
                session_date=session_date,
                bucket_start=bucket_start,
                open=float(open_price),
                high=float(high),
                low=float(low),
                close=float(close),
                volume=None,
                amount=None,
                source="yahoo",
            )
        )
    if not bars:
        raise RuntimeError(f"Yahoo {symbol} {tf} 返回空结果")
    return bars


def _period_params(start: str | None, end: str | None, fallback_range: str) -> dict:
    start_date = norm_date(start)
    end_date = norm_date(end)
    if not start_date and not end_date:
        return {"range": fallback_range}
    start_dt = datetime.combine(
        date.fromisoformat(start_date) if start_date else date.today() - timedelta(days=3650),
        datetime.min.time(),
        tzinfo=MARKET_TZ,
    )
    end_dt = datetime.combine(
        date.fromisoformat(end_date) if end_date else date.today(),
        datetime.min.time(),
        tzinfo=MARKET_TZ,
    ) + timedelta(days=1)
    return {
        "period1": int(start_dt.timestamp()),
        "period2": int(end_dt.timestamp()),
    }


class YahooProvider(MarketProvider):
    name = "yahoo"
    capabilities = frozenset(
        {
            CAPABILITY_MARKET_ASSET_MINUTE,
            CAPABILITY_MARKET_ASSET_DAILY,
        }
    )

    def _fetch(self, interval: str, params: dict) -> dict:
        query = urllib.parse.urlencode({"interval": interval, **params})
        req = urllib.request.Request(
            f"{_CHART_URL}?{query}",
            headers={"User-Agent": UA, "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))

    def market_asset_minute(
        self,
        symbol: str,
        tf: str,
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
    ) -> list[MarketAssetBar]:
        if symbol != "IXIC":
            raise ValueError(f"Yahoo market_asset_minute 仅支持 IXIC，收到 {symbol}")
        if tf != "5m":
            raise ValueError(f"Yahoo IXIC 分时只支持 5m，收到 {tf}")
        payload = self._fetch(
            "5m",
            _period_params(start, end, "5d"),
        )
        return parse_yahoo_market_asset_bars(payload, symbol, tf)[-limit:]

    def market_asset_daily(
        self,
        symbol: str,
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
    ) -> list[MarketAssetBar]:
        if symbol != "IXIC":
            raise ValueError(f"Yahoo market_asset_daily 仅支持 IXIC，收到 {symbol}")
        payload = self._fetch(
            "1d",
            _period_params(start, end, "5y"),
        )
        return parse_yahoo_market_asset_bars(payload, symbol, "1d")[-limit:]
