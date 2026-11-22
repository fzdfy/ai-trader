"""新浪财经行情与财务 provider。

能力：adjust_factor（前复权 qfq / 后复权 hfq 复权因子序列）/
financial_statements（利润表、资产负债表、现金流量表）。

一次 HTTP 约 1.8KB，零鉴权。用 stdlib urllib 直连 + json.raw_decode 解析
（响应末尾挂着 `/* base64 */` 注释块，不能用 `$` 锚定正则）。
"""
from __future__ import annotations

import json
import urllib.request
from datetime import date, datetime, time as datetime_time
from zoneinfo import ZoneInfo

from ...base import (
    CAPABILITY_FINANCIAL_STATEMENTS,
    CAPABILITY_MARKET_ASSET_DAILY,
    CAPABILITY_MARKET_ASSET_MINUTE,
    CAPABILITY_STOCK_NEWS,
    MarketProvider,
)
from ...common import MARKET_TZ, UA, get_prefix, norm_date, norm_ticker
from ...schemas import AdjustFactor, FinancialSnapshotItem, MarketAssetBar, NewsItem


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


_STATEMENT_TYPES = {
    "fzb": "balance_sheet",
    "lrb": "income_statement",
    "llb": "cash_flow",
}

_XAU_DAILY_URL = (
    "https://stock2.finance.sina.com.cn/futures/api/jsonp.php/"
    "var%20_XAU=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=XAU&type=5"
)
_XAU_MINUTE_URL = (
    "https://stock2.finance.sina.com.cn/futures/api/jsonp.php/"
    "var%20_XAU=/GlobalFuturesService.getGlobalFuturesMinLine?symbol=XAU"
)


def _parse_sina_jsonp(text: str, symbol: str):
    start = text.find("(")
    end = text.rfind(")")
    if start < 0 or end <= start:
        raise RuntimeError(f"新浪 {symbol} 响应不是预期 JSONP")
    try:
        payload = json.loads(text[start + 1 : end])
    except json.JSONDecodeError as error:
        raise RuntimeError(f"新浪 {symbol} JSONP 解析失败: {error}") from error
    if isinstance(payload, dict) and "__ERROR" in payload:
        raise RuntimeError(
            f"新浪 {symbol} 端点错误: {payload.get('__ERRORMSG') or payload['__ERROR']}"
        )
    return payload


def parse_sina_xau_daily(text: str) -> list[MarketAssetBar]:
    rows = _parse_sina_jsonp(text, "XAUUSD")
    if not isinstance(rows, list):
        raise RuntimeError("新浪 XAUUSD 日线响应不是列表")
    bars: list[MarketAssetBar] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            session_date = date.fromisoformat(str(row["date"])[:10])
            bars.append(
                MarketAssetBar(
                    symbol="XAUUSD",
                    session_date=session_date,
                    bucket_start=datetime.combine(
                        session_date,
                        datetime_time.min,
                        tzinfo=MARKET_TZ,
                    ),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=None,
                    amount=None,
                    source="sina",
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    if not bars:
        raise RuntimeError("新浪 XAUUSD 日线返回空结果")
    return sorted(bars, key=lambda bar: bar.bucket_start)


def parse_sina_xau_minute(text: str) -> list[MarketAssetBar]:
    payload = _parse_sina_jsonp(text, "XAUUSD")
    rows = payload.get("minLine_1d") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("新浪 XAUUSD 分时返回空结果")
    first = rows[0]
    if not isinstance(first, list) or len(first) < 10:
        raise RuntimeError("新浪 XAUUSD 分时首行格式异常")
    session_date = date.fromisoformat(str(first[0])[:10])
    bars: list[MarketAssetBar] = []
    for index, row in enumerate(rows):
        if not isinstance(row, list):
            continue
        try:
            price = float(row[5] if index == 0 else row[1])
            timestamp = datetime.fromisoformat(str(row[9] if index == 0 else row[5]))
        except (IndexError, TypeError, ValueError):
            continue
        bars.append(
            MarketAssetBar(
                symbol="XAUUSD",
                session_date=session_date,
                bucket_start=timestamp.replace(tzinfo=MARKET_TZ),
                open=price,
                high=price,
                low=price,
                close=price,
                volume=None,
                amount=None,
                source="sina",
            )
        )
    if not bars:
        raise RuntimeError("新浪 XAUUSD 分时没有有效分钟点")
    return bars


def _number_or_text(value):
    if value is None or value == "":
        return None
    text = str(value).strip()
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return text


def parse_sina_financial_reports(
    payload: dict,
    symbol: str,
    report_type: str,
) -> list[FinancialSnapshotItem]:
    statement_type = _STATEMENT_TYPES.get(report_type)
    if statement_type is None:
        raise ValueError(f"新浪财务报表类型不支持: {report_type}")
    report_list = (
        (((payload.get("result") or {}).get("data") or {}).get("report_list"))
        or {}
    )
    periods = (
        report_list.items()
        if isinstance(report_list, dict)
        else [
            (str(item.get("report_date") or ""), item)
            for item in report_list
            if isinstance(item, dict)
        ]
    )
    result: list[FinancialSnapshotItem] = []
    for raw_period, period_payload in periods:
        period = str(raw_period)
        if len(period) != 8 or not period.isdigit():
            continue
        metrics: dict[str, float | str | None] = {}
        for item in (period_payload or {}).get("data") or []:
            title = str(item.get("item_title") or "").strip()
            if not title or item.get("item_value") is None:
                continue
            metrics[title] = _number_or_text(item.get("item_value"))
            if item.get("item_tongbi") not in (None, ""):
                metrics[f"{title}_同比"] = _number_or_text(item.get("item_tongbi"))
        result.append(
            FinancialSnapshotItem(
                symbol=symbol,
                report_period=f"{period[:4]}-{period[4:6]}-{period[6:8]}",
                statement_type=statement_type,
                source="sina",
                metrics=metrics,
                raw={"report_type": report_type, "report_period": period},
            )
        )
    return sorted(result, key=lambda item: item.report_period, reverse=True)


class SinaProvider(MarketProvider):
    name = "sina"
    capabilities = frozenset(
        {
            "adjust_factor",
            CAPABILITY_STOCK_NEWS,
            CAPABILITY_FINANCIAL_STATEMENTS,
            CAPABILITY_MARKET_ASSET_MINUTE,
            CAPABILITY_MARKET_ASSET_DAILY,
        }
    )

    def market_asset_minute(
        self,
        symbol: str,
        tf: str,
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
    ) -> list[MarketAssetBar]:
        if symbol != "XAUUSD":
            raise ValueError(f"新浪 market_asset_minute 仅支持 XAUUSD，收到 {symbol}")
        if tf != "1m":
            raise ValueError(f"新浪 XAUUSD 分时只支持 tf=1m，收到 {tf}")
        req = urllib.request.Request(
            _XAU_MINUTE_URL,
            headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"},
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            text = response.read().decode("utf-8", errors="replace")
        bars = parse_sina_xau_minute(text)
        start_date = norm_date(start)
        end_date = norm_date(end)
        if start_date or end_date:
            bars = [
                bar
                for bar in bars
                if (not start_date or bar.session_date.isoformat() >= start_date)
                and (not end_date or bar.session_date.isoformat() <= end_date)
            ]
        return bars[-limit:]

    def market_asset_daily(
        self,
        symbol: str,
        limit: int = 500,
        start: str | None = None,
        end: str | None = None,
    ) -> list[MarketAssetBar]:
        if symbol != "XAUUSD":
            raise ValueError(f"新浪 market_asset_daily 仅支持 XAUUSD，收到 {symbol}")
        req = urllib.request.Request(
            _XAU_DAILY_URL,
            headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"},
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            text = response.read().decode("utf-8", errors="replace")
        bars = parse_sina_xau_daily(text)
        start_date = norm_date(start)
        end_date = norm_date(end)
        if start_date or end_date:
            bars = [
                bar
                for bar in bars
                if (not start_date or bar.session_date.isoformat() >= start_date)
                and (not end_date or bar.session_date.isoformat() <= end_date)
            ]
        return bars[-limit:]

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

    def financial_statements(
        self, symbol: str, periods: int = 8
    ) -> list[FinancialSnapshotItem]:
        code = f"{get_prefix(symbol)}{norm_ticker(symbol)}"
        result: list[FinancialSnapshotItem] = []
        errors: list[Exception] = []
        for report_type in ("lrb", "fzb", "llb"):
            url = (
                "https://quotes.sina.cn/cn/api/openapi.php/"
                "CompanyFinanceService.getFinanceReport2022?"
                f"paperCode={code}&source={report_type}&type=0&page=1"
                f"&num={max(1, min(periods, 20))}"
            )
            try:
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": UA,
                        "Referer": "https://finance.sina.com.cn/",
                    },
                )
                with urllib.request.urlopen(req, timeout=15) as response:
                    payload = json.loads(
                        response.read().decode("utf-8", errors="replace")
                    )
                result.extend(parse_sina_financial_reports(payload, symbol, report_type))
            except Exception as exc:  # noqa: BLE001 — 单表失败不阻断其他两张表
                errors.append(exc)
        if not result and errors:
            raise errors[-1]
        return result
