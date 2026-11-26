"""Growth/defense rotation index daily data.

The strategy compares 创业板50 (399673) with 红利低波100 (930955).  Both
series are fetched from independent public sources and normalized into one
close-only contract for the rotation service.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date

from .common import MARKET_TZ, UA, norm_date

_CSINDEX_URL = "https://www.csindex.com.cn/csindex-home/perf/index-perf"
_TENCENT_INDEX_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"


@dataclass(frozen=True, slots=True)
class RotationIndexBar:
    symbol: str
    trade_date: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None
    amount: float | None
    source: str


@dataclass(frozen=True, slots=True)
class MainIndexDefinition:
    symbol: str
    name: str
    provider: str
    provider_symbol: str


MAIN_INDEX_ASSETS: dict[str, MainIndexDefinition] = {
    "000001.SH": MainIndexDefinition("000001.SH", "上证指数", "tencent", "sh000001"),
    "000300.SH": MainIndexDefinition("000300.SH", "沪深300", "tencent", "sh000300"),
    "000905.SH": MainIndexDefinition("000905.SH", "中证500", "tencent", "sh000905"),
    "000852.SH": MainIndexDefinition("000852.SH", "中证1000", "tencent", "sh000852"),
    "399673.SZ": MainIndexDefinition("399673.SZ", "创业板50", "tencent", "sz399673"),
    "000688.SH": MainIndexDefinition("000688.SH", "科创50", "tencent", "sh000688"),
    "930955.CSI": MainIndexDefinition(
        "930955.CSI",
        "中证红利低波100",
        "csindex",
        "930955",
    ),
}


def _number(value: object, field: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} 不是有效数字: {value!r}") from None


def _csindex_date(value: object) -> str:
    raw = str(value or "").strip()
    normalized = norm_date(raw)
    if normalized is None or len(normalized) != 10:
        raise ValueError(f"中证指数日期格式异常: {value!r}")
    try:
        date.fromisoformat(normalized)
    except ValueError:
        raise ValueError(f"中证指数日期格式异常: {value!r}") from None
    return normalized


def parse_csindex_daily(payload: dict, symbol: str) -> list[RotationIndexBar]:
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{symbol} 中证指数日线为空")
    bars: list[RotationIndexBar] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        bars.append(
            RotationIndexBar(
                symbol=symbol,
                trade_date=_csindex_date(row.get("tradeDate")),
                open=_number(row.get("open"), "open"),
                high=_number(row.get("high"), "high"),
                low=_number(row.get("low"), "low"),
                close=_number(row.get("close"), "close"),
                volume=(
                    _number(row.get("tradingVol"), "tradingVol")
                    if row.get("tradingVol") is not None
                    else None
                ),
                amount=(
                    _number(row.get("tradingValue"), "tradingValue")
                    if row.get("tradingValue") is not None
                    else None
                ),
                source="csindex",
            )
        )
    if not bars:
        raise ValueError(f"{symbol} 中证指数日线格式异常")
    return sorted(bars, key=lambda bar: bar.trade_date)


def parse_tencent_index_daily(payload: dict, symbol: str) -> list[RotationIndexBar]:
    definition = MAIN_INDEX_ASSETS.get(symbol)
    provider_symbol = definition.provider_symbol if definition else "sz399673"
    data = payload.get("data") if isinstance(payload, dict) else None
    node = data.get(provider_symbol) if isinstance(data, dict) else None
    rows = node.get("day") if isinstance(node, dict) else None
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{symbol} 腾讯指数日线格式异常或为空")
    bars: list[RotationIndexBar] = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 6:
            continue
        trade_date = str(row[0])
        try:
            date.fromisoformat(trade_date)
        except ValueError:
            raise ValueError(f"腾讯指数日期格式异常: {trade_date!r}") from None
        bars.append(
            RotationIndexBar(
                symbol=symbol,
                trade_date=trade_date,
                open=_number(row[1], "open"),
                close=_number(row[2], "close"),
                high=_number(row[3], "high"),
                low=_number(row[4], "low"),
                volume=_number(row[5], "volume"),
                amount=None,
                source="tencent",
            )
        )
    if not bars:
        raise ValueError(f"{symbol} 腾讯指数日线格式异常")
    return sorted(bars, key=lambda bar: bar.trade_date)


def _read_json(request: urllib.request.Request) -> dict:
    with urllib.request.urlopen(request, timeout=15) as response:
        raw = response.read().decode("utf-8", "replace")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError("指数日线返回不是 JSON") from error
    if not isinstance(payload, dict):
        raise RuntimeError("指数日线返回格式异常")
    return payload


def fetch_csindex_daily(index_code: str, start: str, end: str) -> list[RotationIndexBar]:
    normalized_start = norm_date(start)
    normalized_end = norm_date(end)
    if not normalized_start or not normalized_end:
        raise ValueError("指数日线起止日期不能为空")
    query = urllib.parse.urlencode(
        {
            "indexCode": index_code,
            "startDate": normalized_start.replace("-", ""),
            "endDate": normalized_end.replace("-", ""),
        }
    )
    request = urllib.request.Request(
        f"{_CSINDEX_URL}?{query}",
        headers={"User-Agent": UA, "Referer": "https://www.csindex.com.cn/"},
    )
    return parse_csindex_daily(_read_json(request), f"{index_code}.CSI")


def fetch_tencent_index_daily(
    symbol: str,
    start: str,
    end: str,
) -> list[RotationIndexBar]:
    normalized_start = norm_date(start)
    normalized_end = norm_date(end)
    if not normalized_start or not normalized_end:
        raise ValueError("指数日线起止日期不能为空")
    definition = MAIN_INDEX_ASSETS[symbol]
    if definition.provider != "tencent":
        raise ValueError(f"{symbol} 不是腾讯指数")
    param = f"{definition.provider_symbol},day,,,600,none"
    query = urllib.parse.urlencode({"param": param})
    request = urllib.request.Request(
        f"{_TENCENT_INDEX_URL}?{query}",
        headers={"User-Agent": UA},
    )
    return [
        bar
        for bar in parse_tencent_index_daily(_read_json(request), symbol)
        if normalized_start <= bar.trade_date <= normalized_end
    ]


def fetch_tencent_399673_daily(start: str, end: str) -> list[RotationIndexBar]:
    return fetch_tencent_index_daily("399673.SZ", start, end)


def fetch_growth_defense_history(start: str, end: str) -> dict[str, object]:
    """Fetch both indices and preserve usable data when one source fails."""
    bars: list[RotationIndexBar] = []
    errors: list[dict[str, str]] = []
    for symbol, fetcher in (
        ("399673.SZ", lambda: fetch_tencent_399673_daily(start, end)),
        ("930955.CSI", lambda: fetch_csindex_daily("930955", start, end)),
    ):
        try:
            bars.extend(fetcher())
        except Exception as error:
            errors.append({"symbol": symbol, "error": str(error)})
    if not bars:
        raise RuntimeError("成长/防守指数全部取数失败")
    return {
        "bars": sorted(bars, key=lambda bar: (bar.trade_date, bar.symbol)),
        "errors": errors,
    }


def fetch_main_index_history(start: str, end: str) -> dict[str, object]:
    """Fetch the seven fixed main indices and preserve partial success."""
    bars: list[RotationIndexBar] = []
    errors: list[dict[str, str]] = []
    for symbol, definition in MAIN_INDEX_ASSETS.items():
        try:
            if definition.provider == "csindex":
                bars.extend(fetch_csindex_daily(definition.provider_symbol, start, end))
            else:
                bars.extend(fetch_tencent_index_daily(symbol, start, end))
        except Exception as error:
            errors.append({"symbol": symbol, "error": str(error)})
    if not bars:
        raise RuntimeError("主要指数全部取数失败")
    return {
        "bars": sorted(bars, key=lambda bar: (bar.trade_date, bar.symbol)),
        "errors": errors,
    }
