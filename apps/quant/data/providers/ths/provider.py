"""同花顺（THS）信号与一致预期 provider。

能力：hot_reason（当日强势股 + 题材归因）/ northbound（沪深股通分钟流向）/
analyst_consensus（机构一致预期 EPS）。

- hot_reason：同花顺编辑部人工运营的题材标签，独家能力，零鉴权。
- northbound：沪深股通当日实时分钟流向（hgt 可用，sgt 盘中披露收紧后仅供参考）。

用 stdlib urllib 直连，不引入第三方 HTTP 库。hot_reason 响应为 GBK 编码 JSON，
northbound 响应为 UTF-8 JSON。
"""
from __future__ import annotations

import html as _html
import json
import re
import urllib.request
from datetime import date as _date

from ...base import CAPABILITY_ANALYST_CONSENSUS, MarketProvider
from ...common import UA, get_prefix, norm_ticker
from ...schemas import AnalystConsensusItem, HotReasonItem, NorthboundPoint

_ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
_CELL_RE = re.compile(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", re.IGNORECASE | re.DOTALL)
_TABLE_RE = re.compile(r"<table\b[^>]*>(.*?)</table>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")


def _f(v):
    """宽松转 float：None/空串/非法 → None。"""
    if v is None or v == "" or v == "-":
        return None
    match = re.search(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)", str(v).replace(",", ""))
    if match is None:
        return None
    try:
        return float(match.group(0))
    except (TypeError, ValueError):
        return None


def _clean_cell(value: str) -> str:
    return _html.unescape(_TAG_RE.sub("", value)).replace("\xa0", " ").strip()


def _rows(page: str) -> list[list[str]]:
    return [
        [_clean_cell(cell) for cell in _CELL_RE.findall(row)]
        for row in _ROW_RE.findall(page)
    ]


def _tables(page: str) -> list[tuple[list[list[str]], str]]:
    result: list[tuple[list[list[str]], str]] = []
    previous_end = 0
    for match in _TABLE_RE.finditer(page):
        context = _clean_cell(page[previous_end : match.start()])[-1000:]
        result.append((_rows(match.group(1)), context))
        previous_end = match.end()
    return result


def parse_ths_analyst_consensus_html(
    page: str,
    symbol: str,
    as_of_date: str | None = None,
) -> list[AnalystConsensusItem]:
    candidates: list[list[list[str]]] = []
    for table_rows, context in _tables(page):
        rows = [row for row in table_rows if len(row) >= 5]
        header_index = next(
            (
                index
                for index, row in enumerate(rows)
                if all(
                    any(name in cell for cell in row)
                    for name in ("年度", "预测机构数", "最小值", "均值", "最大值")
                )
            ),
            None,
        )
        if header_index is not None:
            candidates.append(rows[header_index:])
            if "每股收益" in context:
                candidates = [candidates[-1]]
                break
    if not candidates:
        raise RuntimeError("同花顺一致预期页面缺少均值表头")

    rows = candidates[0]
    header_index = 0
    header = rows[header_index]

    def column(*names: str) -> int | None:
        for index, cell in enumerate(header):
            if any(name in cell for name in names):
                return index
        return None

    count_column = column("预测机构数", "机构数")
    min_column = column("最小值")
    mean_column = column("均值")
    max_column = column("最大值")
    if mean_column is None or min_column is None or max_column is None:
        raise RuntimeError("同花顺一致预期页面缺少 EPS 分位列")

    observed = as_of_date or _date.today().isoformat()
    result: list[AnalystConsensusItem] = []
    for row in rows[header_index + 1 :]:
        year_match = next(
            (re.search(r"(?<!\d)(20\d{2})(?!\d)", cell) for cell in row if cell),
            None,
        )
        if year_match is None:
            continue
        count = _f(row[count_column]) if count_column is not None else None
        result.append(
            AnalystConsensusItem(
                symbol=symbol,
                as_of_date=observed,
                fiscal_year=int(year_match.group(1)),
                eps_min=_f(row[min_column]),
                eps_mean=_f(row[mean_column]),
                eps_max=_f(row[max_column]),
                analyst_count=int(count) if count is not None else None,
                source="ths",
                raw={"cells": row},
            )
        )
    return sorted(result, key=lambda item: item.fiscal_year)


class ThsProvider(MarketProvider):
    name = "ths"
    capabilities = frozenset(
        {"hot_reason", "northbound", CAPABILITY_ANALYST_CONSENSUS}
    )

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

    def analyst_consensus(
        self, symbol: str, as_of_date: str | None = None
    ) -> list[AnalystConsensusItem]:
        code = norm_ticker(symbol)
        if get_prefix(symbol) == "bj":
            raise ValueError(f"同花顺一致预期暂不支持北交所标的: {symbol}")
        url = f"https://basic.10jqka.com.cn/new/{code}/worth.html"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": UA,
                "Referer": "https://basic.10jqka.com.cn/",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            page = response.read().decode("gbk", errors="replace")
        return parse_ths_analyst_consensus_html(
            page,
            symbol,
            as_of_date=as_of_date or _date.today().isoformat(),
        )
