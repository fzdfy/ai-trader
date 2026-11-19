"""新浪财经行情源 provider。

能力：adjust_factor（前复权 qfq / 后复权 hfq 复权因子序列）。

一次 HTTP 约 1.8KB，零鉴权。用 stdlib urllib 直连 + json.raw_decode 解析
（响应末尾挂着 `/* base64 */` 注释块，不能用 `$` 锚定正则）。
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

from ...base import CAPABILITY_STOCK_NEWS, MarketProvider
from ...common import UA, get_prefix, norm_ticker
from ...schemas import AdjustFactor, NewsItem


def _sina_symbol(value: str) -> str | None:
    raw = value.strip().lower()
    if len(raw) < 8 or raw[:2] not in {"sh", "sz", "bj"}:
        return None
    digits = raw[2:]
    if not digits.isdigit() or len(digits) != 6:
        return None
    return f"{digits}.{raw[:2].upper()}"


def parse_sina_stock_news(payload: dict, symbol: str) -> list[NewsItem]:
    target = f"{norm_ticker(symbol)}.{get_prefix(symbol).upper()}"
    feed = ((payload.get("result") or {}).get("data") or {}).get("feed") or {}
    rows = feed.get("list") or []
    result: list[NewsItem] = []
    for row in rows:
        ext = row.get("ext")
        if isinstance(ext, str):
            try:
                ext = json.loads(ext)
            except json.JSONDecodeError:
                ext = {}
        related = []
        for stock in (ext or {}).get("stocks") or []:
            if stock.get("market") != "cn":
                continue
            normalized = _sina_symbol(str(stock.get("symbol") or ""))
            if normalized:
                related.append(normalized)
        if target not in related:
            continue
        text = str(row.get("rich_text") or "").strip()
        headline = text
        if text.startswith("【") and "】" in text:
            headline = text[1 : text.index("】")]
        created = str(row.get("create_time") or "").strip()
        published_at = None
        if created:
            try:
                published_at = datetime.fromisoformat(created).replace(
                    tzinfo=ZoneInfo("Asia/Shanghai")
                ).isoformat()
            except ValueError:
                published_at = None
        result.append(
            NewsItem(
                source="sina",
                title=headline[:120],
                content=text or None,
                url=str(row.get("docurl") or (ext or {}).get("docurl") or ""),
                published_at=published_at,
                related_symbols=list(dict.fromkeys(related)),
            )
        )
    return result


class SinaProvider(MarketProvider):
    name = "sina"
    capabilities = frozenset({"adjust_factor", CAPABILITY_STOCK_NEWS})

    def stock_news(self, symbol: str, page_size: int = 20) -> list[NewsItem]:
        url = (
            "https://zhibo.sina.com.cn/api/zhibo/feed?"
            f"zhibo_id=152&page_size={max(20, min(page_size * 5, 100))}&dire=f"
        )
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/7x24/"},
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
        return parse_sina_stock_news(payload, symbol)[:page_size]

    def adjust_factor(self, symbol: str, kind: str = "qfq") -> list[AdjustFactor]:
        if kind not in ("qfq", "hfq"):
            raise ValueError(f"kind 只能是 'qfq' 或 'hfq'，收到 {kind!r}")

        digits = norm_ticker(symbol)
        prefix = get_prefix(symbol)
        code = f"{prefix}{digits}"
        url = f"https://finance.sina.com.cn/realstock/company/{code}/{kind}.js"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode("utf-8", errors="replace")

        brace = text.find("{")
        if brace < 0:
            raise RuntimeError(f"新浪复权因子响应无 JSON（{code}/{kind}）: {text[:120]}")
        data, _ = json.JSONDecoder().raw_decode(text[brace:])
        return [
            AdjustFactor(date=it["d"], factor=float(it["f"]))
            for it in data.get("data", [])
        ]
