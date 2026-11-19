"""巨潮资讯公告 Provider。"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ...base import CAPABILITY_ANNOUNCEMENT, MarketProvider
from ...common import UA, get_prefix, norm_ticker
from ...schemas import AnnouncementItem

_MARKET_TZ = ZoneInfo("Asia/Shanghai")
_ORG_ID_CACHE: dict[str, str] | None = None


def parse_cninfo_announcements(
    payload: dict, symbol: str
) -> list[AnnouncementItem]:
    canonical = f"{norm_ticker(symbol)}.{get_prefix(symbol).upper()}"
    result: list[AnnouncementItem] = []
    for row in payload.get("announcements") or []:
        source_id = str(row.get("announcementId") or "").strip()
        title = str(row.get("announcementTitle") or "").strip()
        if not source_id or not title:
            continue
        announcement_time = row.get("announcementTime")
        if isinstance(announcement_time, (int, float)):
            published_at = datetime.fromtimestamp(
                announcement_time / 1000, tz=_MARKET_TZ
            ).date().isoformat()
        else:
            published_at = str(announcement_time or "")[:10]
        adjunct = str(row.get("adjunctUrl") or "").strip()
        result.append(
            AnnouncementItem(
                source="cninfo",
                source_id=source_id,
                title=title,
                announcement_type=row.get("announcementTypeName"),
                published_at=published_at,
                url=(
                    "https://www.cninfo.com.cn/new/disclosure/detail"
                    f"?annoId={urllib.parse.quote(source_id)}&stock={canonical}"
                ),
                pdf_url=(
                    f"https://static.cninfo.com.cn/{adjunct.lstrip('/')}"
                    if adjunct
                    else None
                ),
            )
        )
    return result


def _load_org_ids() -> dict[str, str]:
    global _ORG_ID_CACHE
    if _ORG_ID_CACHE is not None:
        return _ORG_ID_CACHE
    req = urllib.request.Request(
        "https://www.cninfo.com.cn/new/data/szse_stock.json",
        headers={"User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = json.loads(response.read().decode("utf-8", errors="replace"))
    _ORG_ID_CACHE = {
        str(row.get("code")): str(row.get("orgId"))
        for row in payload.get("stockList") or []
        if row.get("code") and row.get("orgId")
    }
    return _ORG_ID_CACHE


def _org_id(code: str) -> str:
    return _load_org_ids().get(code) or f"gs{get_prefix(code)}0{code}"


class CninfoProvider(MarketProvider):
    name = "cninfo"
    capabilities = frozenset({CAPABILITY_ANNOUNCEMENT})

    def announcements(
        self, symbol: str, since_days: int = 30, page_size: int = 30
    ) -> list[AnnouncementItem]:
        digits = norm_ticker(symbol)
        global _ORG_ID_CACHE
        configured_pages = min(
            5,
            max(
                1,
                (max(1, since_days) // 30) + 1,
            ),
        )
        result: list[AnnouncementItem] = []
        cutoff = (datetime.now(_MARKET_TZ).date() - timedelta(days=max(1, since_days))).isoformat()
        for page in range(1, configured_pages + 1):
            body = urllib.parse.urlencode(
                {
                    "stock": f"{digits},{_org_id(digits)}",
                    "tabName": "fulltext",
                    "pageSize": str(max(1, min(page_size, 100))),
                    "pageNum": str(page),
                    "column": "",
                    "category": "",
                    "plate": "",
                    "seDate": "",
                    "searchkey": "",
                    "secid": "",
                    "sortName": "",
                    "sortType": "",
                    "isHLtitle": "true",
                }
            ).encode()
            req = urllib.request.Request(
                "https://www.cninfo.com.cn/new/hisAnnouncement/query",
                data=body,
                headers={
                    "User-Agent": UA,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": "https://www.cninfo.com.cn/new/disclosure",
                    "Origin": "https://www.cninfo.com.cn",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                payload = json.loads(response.read().decode("utf-8", errors="replace"))
            page_items = parse_cninfo_announcements(payload, symbol)
            result.extend(item for item in page_items if item.published_at >= cutoff)
            if len(page_items) < page_size:
                break
        return result[: max(1, min(page_size, 100))]
