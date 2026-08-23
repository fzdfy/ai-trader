"""新浪财经行情源 provider。

能力：adjust_factor（前复权 qfq / 后复权 hfq 复权因子序列）。

一次 HTTP 约 1.8KB，零鉴权。用 stdlib urllib 直连 + json.raw_decode 解析
（响应末尾挂着 `/* base64 */` 注释块，不能用 `$` 锚定正则）。
"""
from __future__ import annotations

import json
import urllib.request

from ...base import MarketProvider
from ...common import UA, get_prefix, norm_ticker
from ...schemas import AdjustFactor


class SinaProvider(MarketProvider):
    name = "sina"
    capabilities = frozenset({"adjust_factor"})

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
