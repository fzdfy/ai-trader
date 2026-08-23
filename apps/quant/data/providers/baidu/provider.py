"""百度股市通行情源 provider。

能力：kline（日线，自带 MA5/MA10/MA20，无需本地计算）。

HTTP GET JSON，用 stdlib urllib 直连。仅支持日线（ktype=1）；作为 mootdx
日线取数失败时的降级源。
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

from ...base import MarketProvider
from ...common import UA, norm_ticker
from ...schemas import KlineBar

_URL = "https://finance.pae.baidu.com/selfselect/getstockquotation"
_HEADERS = {
    "User-Agent": UA,
    "Accept": "application/vnd.finance-web.v1+json",
    "Origin": "https://gushitong.baidu.com",
    "Referer": "https://gushitong.baidu.com/",
}


class BaiduProvider(MarketProvider):
    name = "baidu"
    capabilities = frozenset({"kline"})

    def kline(
        self,
        symbol: str,
        tf: str = "1d",
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
    ) -> list[KlineBar]:
        params = {
            "all": "1",
            "isIndex": "false",
            "isBk": "false",
            "isBlock": "false",
            "isFutures": "false",
            "isStock": "true",
            "newFormat": "1",
            "group": "quotation_kline_ab",
            "finClientType": "pc",
            "code": norm_ticker(symbol),
            "start_time": "",
            "ktype": "1",
        }
        url = f"{_URL}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            d = json.loads(resp.read().decode("utf-8"))

        md = d.get("Result", {}).get("newMarketData", {})
        keys = md.get("keys", [])
        rows = md.get("marketData", "").split(";")
        if not keys or not rows:
            return []

        # 定位关键字段在 keys 中的位置
        def idx(*names: str) -> int | None:
            for n in names:
                if n in keys:
                    return keys.index(n)
            return None

        i_time, i_open = idx("time", "date"), idx("open")
        i_high, i_low = idx("high"), idx("low")
        i_close, i_volume = idx("close"), idx("volume")
        i_amount = idx("amount")
        i_ma5, i_ma10 = idx("ma5avgprice"), idx("ma10avgprice")
        i_ma20 = idx("ma20avgprice")

        bars: list[KlineBar] = []
        for row in rows:
            vals = row.split(",")
            if len(vals) < len(keys):
                continue

            def g(i: int | None) -> float | None:
                if i is None or i >= len(vals) or not vals[i]:
                    return None
                try:
                    return float(vals[i])
                except ValueError:
                    return None

            bar = KlineBar(
                time=str(vals[i_time])[:10] if i_time is not None else "",
                open=g(i_open) or 0.0,
                high=g(i_high) or 0.0,
                low=g(i_low) or 0.0,
                close=g(i_close) or 0.0,
                volume=g(i_volume) or 0.0,
                amount=g(i_amount),
                ma5=g(i_ma5),
                ma10=g(i_ma10),
                ma20=g(i_ma20),
            )
            bars.append(bar)

        if start or end:
            bars = [
                b
                for b in bars
                if (not start or b.time >= start) and (not end or b.time <= end)
            ]
        return bars[-limit:] if limit > 0 else bars
