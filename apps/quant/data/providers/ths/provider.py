"""同花顺（THS）信号源 provider。

能力：hot_reason（当日强势股 + 题材归因）/ northbound（沪深股通分钟流向）。

- hot_reason：同花顺编辑部人工运营的题材标签，独家能力，零鉴权。
- northbound：沪深股通当日实时分钟流向（hgt 可用，sgt 盘中披露收紧后仅供参考）。

用 stdlib urllib 直连，不引入第三方 HTTP 库。hot_reason 响应为 GBK 编码 JSON，
northbound 响应为 UTF-8 JSON。
"""
from __future__ import annotations

import json
import urllib.request
from datetime import date as _date

from ...base import MarketProvider
from ...common import UA
from ...schemas import HotReasonItem, NorthboundPoint


def _f(v):
    """宽松转 float：None/空串/非法 → None。"""
    if v is None or v == "" or v == "-":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


class ThsProvider(MarketProvider):
    name = "ths"
    capabilities = frozenset({"hot_reason", "northbound"})

    # ── 3.1 同花顺热点 ──────────────────────────────────────────────

    def hot_reason(self, date: str | None = None) -> list[HotReasonItem]:
        if date is None:
            date = _date.today().strftime("%Y-%m-%d")
        url = (
            f"http://zx.10jqka.com.cn/event/api/getharden/"
            f"date/{date}/orderby/date/orderway/desc/charset/GBK/"
        )
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "Chrome/117.0.0.0 Safari/537.36"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("gbk", errors="replace"))

        if data.get("errocode", 0) != 0:
            raise RuntimeError(f"同花顺热点错误: {data.get('errormsg', '')}")

        items: list[HotReasonItem] = []
        for row in data.get("data") or []:
            items.append(
                HotReasonItem(
                    code=str(row.get("code", "")).zfill(6),
                    name=str(row.get("name", "")),
                    reason=str(row.get("reason", "")),
                    close=_f(row.get("close")),
                    change=_f(row.get("zhangdie")),
                    change_pct=_f(row.get("zhangfu")),
                    turnover_rate=_f(row.get("huanshou")),
                    amount=_f(row.get("chengjiaoe")),
                    volume=_f(row.get("chengjiaoliang")),
                    large_order_net=_f(row.get("ddejingliang")),
                    market=str(row.get("market", "")),
                )
            )
        return items

    # ── 3.2 北向资金（分钟流向）─────────────────────────────────────

    def northbound(self) -> list[NorthboundPoint]:
        url = "https://data.hexin.cn/market/hsgtApi/method/dayChart/"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": UA,
                "Host": "data.hexin.cn",
                "Referer": "https://data.hexin.cn/",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            d = json.loads(resp.read().decode("utf-8", errors="replace"))

        times = d.get("time", []) or []
        hgt = d.get("hgt", []) or []
        sgt = d.get("sgt", []) or []
        n = len(times)
        return [
            NorthboundPoint(
                time=str(t),
                hgt_yi=_f(hgt[i]) if i < len(hgt) else None,
                sgt_yi=_f(sgt[i]) if i < len(sgt) else None,
            )
            for i, t in enumerate(times)
        ]
