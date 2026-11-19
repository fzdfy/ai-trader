"""东方财富研报元数据与受控 PDF 下载。"""
from __future__ import annotations

import re
import urllib.parse
from datetime import date
from typing import Any

from data.providers.eastmoney.provider import _em_get, _em_get_bytes

REPORT_API = "https://reportapi.eastmoney.com/report/list"
PDF_HOSTS = {"pdf.dfcfw.com"}


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _analysts(value: Any) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def _date(value: Any) -> str:
    text = str(value or "")
    return text[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", text) else date.today().isoformat()


def safe_pdf_url(info_code: Any, pdf_url: Any) -> str | None:
    code = str(info_code or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", code):
        return None
    if not pdf_url:
        return f"https://pdf.dfcfw.com/pdf/H3_{code}_1.pdf"
    parsed = urllib.parse.urlparse(str(pdf_url))
    if parsed.scheme != "https" or parsed.hostname not in PDF_HOSTS:
        return None
    return urllib.parse.urlunparse(parsed._replace(fragment=""))


def map_report_row(symbol: str, row: dict[str, Any]) -> dict[str, Any] | None:
    info_code = str(row.get("infoCode") or "").strip()
    title = str(row.get("title") or "").strip()
    if not info_code or not title:
        return None
    forecasts = [
        ("current", row.get("predictThisYearEps")),
        ("next", row.get("predictNextYearEps")),
        ("next_two", row.get("predictNextTwoYearEps")),
    ]
    return {
        "source": "eastmoney",
        "source_id": info_code,
        "symbol": symbol,
        "title": title,
        "institution": row.get("orgSName"),
        "analysts": _analysts(row.get("researcher")),
        "rating": row.get("emRatingName"),
        "industry": row.get("industryName"),
        "publish_date": _date(row.get("publishDate")),
        "pdf_url": safe_pdf_url(info_code, row.get("pdfUrl")),
        "forecasts": [
            {"horizon": horizon, "eps": _number(value), "raw_value": value}
            for horizon, value in forecasts
            if value not in (None, "")
        ],
        "raw": row,
    }


def fetch_reports(
    symbol: str,
    page: int = 1,
    page_size: int = 50,
    begin_time: str = "2020-01-01",
    end_time: str | None = None,
) -> dict[str, Any]:
    code = symbol.split(".")[0]
    if not re.fullmatch(r"\d{6}", code):
        raise ValueError("invalid A-share symbol")
    payload = _em_get(
        REPORT_API,
        params={
            "industryCode": "*",
            "pageSize": str(page_size),
            "industry": "*",
            "rating": "",
            "ratingChange": "",
            "beginTime": begin_time,
            "endTime": end_time or date.today().isoformat(),
            "pageNo": str(page),
            "fields": "",
            "qType": "0",
            "orgCode": "",
            "code": code,
            "rcode": "",
            "p": str(page),
            "pageNum": str(page),
            "pageNumber": str(page),
        },
    )
    rows = payload.get("data") or []
    items = [item for row in rows if (item := map_report_row(symbol, row)) is not None]
    return {
        "symbol": symbol,
        "page": page,
        "page_size": page_size,
        "total": int(payload.get("TotalPage") or payload.get("total") or len(items)),
        "items": items,
    }


def fetch_report_pdf(pdf_url: str) -> bytes:
    parsed = urllib.parse.urlparse(pdf_url)
    if parsed.scheme != "https" or parsed.hostname not in PDF_HOSTS:
        raise ValueError("unsupported PDF host")
    data = _em_get_bytes(pdf_url)
    if not data.startswith(b"%PDF"):
        raise ValueError("response is not a valid PDF")
    return data
