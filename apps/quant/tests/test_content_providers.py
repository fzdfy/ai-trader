import unittest
import json
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.testclient import TestClient

from data.base import (
    CAPABILITY_ANNOUNCEMENT,
    CAPABILITY_MARKET_NEWS,
    CAPABILITY_STOCK_NEWS,
)
from data.registry import capability_chains
from data.schemas import AnnouncementItem, NewsItem
from data.providers.cninfo.provider import parse_cninfo_announcements
from data.providers.cninfo.provider import CninfoProvider
from data.providers.eastmoney.provider import (
    parse_eastmoney_announcements,
    parse_eastmoney_market_news,
    parse_eastmoney_stock_news,
)
from data.providers.sina.provider import parse_sina_stock_news
from data.router import router as data_router


class ContentProviderContractTest(unittest.TestCase):
    def test_news_item_preserves_related_symbols(self):
        item = NewsItem(
            source="eastmoney",
            title="比亚迪海外业务更新",
            content="比亚迪与另一只股票被提及",
            url="https://example.com/news/1",
            published_at="2026-11-19T10:38:00+08:00",
            related_symbols=["002594.SZ", "600519.SH"],
        )
        self.assertEqual(item.related_symbols, ["002594.SZ", "600519.SH"])

    def test_announcement_preserves_source_and_pdf(self):
        item = AnnouncementItem(
            source="cninfo",
            source_id="anno-1",
            title="2026 年第三季度报告",
            announcement_type="季度报告",
            published_at="2026-10-28",
            url="https://example.com/announcement/1",
            pdf_url="https://example.com/announcement/1.pdf",
        )
        self.assertEqual(item.source_id, "anno-1")
        self.assertEqual(item.pdf_url, "https://example.com/announcement/1.pdf")

    def test_content_capabilities_have_approved_fallback_chains(self):
        chains = capability_chains()
        self.assertEqual(chains[CAPABILITY_STOCK_NEWS], ["eastmoney", "sina"])
        self.assertEqual(chains[CAPABILITY_MARKET_NEWS], ["eastmoney"])
        self.assertEqual(chains[CAPABILITY_ANNOUNCEMENT], ["cninfo", "eastmoney"])

    def test_eastmoney_stock_news_jsonp_is_normalized(self):
        payload = (
            'jQuery_news({"result":{"cmsArticleWebOld":['
            '{"title":"<em>比亚迪</em>海外业务更新","content":"正文",'
            '"date":"2026-11-19 10:38:00","url":"https://example.com/1"}'
            "]}});"
        ).encode()
        items = parse_eastmoney_stock_news(payload, "002594.SZ")
        self.assertEqual(items[0].source, "eastmoney")
        self.assertEqual(items[0].title, "比亚迪海外业务更新")
        self.assertEqual(
            items[0].published_at,
            "2026-11-19T10:38:00+08:00",
        )
        self.assertEqual(items[0].related_symbols, ["002594.SZ"])

    def test_sina_stock_news_filters_ext_stocks(self):
        payload = {
            "result": {
                "data": {
                    "feed": {
                        "list": [
                            {
                                "id": 1,
                                "rich_text": "【比亚迪公告】海外业务更新",
                                "create_time": "2026-11-19 18:37:04",
                                "docurl": "https://finance.sina.com.cn/7x24/a.shtml",
                                "ext": json.dumps(
                                    {
                                        "stocks": [
                                            {
                                                "market": "cn",
                                                "symbol": "sz002594",
                                                "key": "比亚迪",
                                            }
                                        ]
                                    },
                                    ensure_ascii=False,
                                ),
                            },
                            {
                                "id": 2,
                                "rich_text": "其他股票新闻",
                                "create_time": "2026-11-19 18:38:04",
                                "docurl": "https://finance.sina.com.cn/7x24/b.shtml",
                                "ext": json.dumps(
                                    {
                                        "stocks": [
                                            {
                                                "market": "cn",
                                                "symbol": "sh600519",
                                            }
                                        ]
                                    }
                                ),
                            },
                        ]
                    }
                }
            }
        }
        items = parse_sina_stock_news(payload, "002594.SZ")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].source, "sina")
        self.assertEqual(items[0].related_symbols, ["002594.SZ"])

    def test_eastmoney_announcement_backup_is_normalized(self):
        payload = {
            "data": {
                "list": [
                    {
                        "art_code": "AN202610280001",
                        "title": "2026年第三季度报告",
                        "notice_date": "2026-10-28 00:00:00",
                    }
                ]
            }
        }
        items = parse_eastmoney_announcements(payload, "002594.SZ")
        self.assertEqual(items[0].source, "eastmoney")
        self.assertEqual(items[0].source_id, "AN202610280001")
        self.assertEqual(
            items[0].pdf_url,
            "https://pdf.dfcfw.com/pdf/H2_AN202610280001_1.pdf",
        )

    def test_eastmoney_market_news_keeps_url_time_and_symbols(self):
        payload = {
            "data": {
                "fastNewsList": [
                    {
                        "code": "202611193935235846",
                        "title": "市场快讯",
                        "summary": "长春一东(600148.SH)公告称控股股东股份被冻结。",
                        "showTime": "2026-11-19 20:47:39",
                        "stockList": ["1.600148", "0.002594"],
                    }
                ]
            }
        }
        items = parse_eastmoney_market_news(payload)
        self.assertEqual(
            items[0].url,
            "https://finance.eastmoney.com/a/202611193935235846.html",
        )
        self.assertEqual(items[0].published_at, "2026-11-19T20:47:39+08:00")
        self.assertEqual(items[0].related_symbols, ["600148.SH", "002594.SZ"])

    def test_cninfo_announcements_are_normalized(self):
        payload = {
            "announcements": [
                {
                    "announcementId": "1224900001",
                    "announcementTitle": "关于 2026 年前三季度经营情况的公告",
                    "announcementTypeName": "临时公告",
                    "announcementTime": 1793145600000,
                }
            ]
        }
        items = parse_cninfo_announcements(payload, "002594.SZ")
        self.assertEqual(items[0].source, "cninfo")
        self.assertEqual(items[0].source_id, "1224900001")
        self.assertEqual(items[0].announcement_type, "临时公告")
        self.assertIn("annoId=1224900001", items[0].url)

    def test_cninfo_announcements_respect_page_size(self):
        now_ms = int(datetime.now(ZoneInfo("Asia/Shanghai")).timestamp() * 1000)
        payload = {
            "announcements": [
                {
                    "announcementId": str(index),
                    "announcementTitle": f"公告 {index}",
                    "announcementTime": now_ms,
                }
                for index in range(1, 3)
            ]
        }

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps(payload).encode()

        with (
            patch(
                "data.providers.cninfo.provider._load_org_ids",
                return_value={"002594": "org-1"},
            ),
            patch(
                "data.providers.cninfo.provider.urllib.request.urlopen",
                return_value=Response(),
            ),
        ):
            items = CninfoProvider().announcements(
                "002594.SZ", since_days=30, page_size=2
            )
        self.assertEqual(len(items), 2)


class ContentRouterTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(data_router, prefix="/api/v1/data")
        self.client = TestClient(app)

    def test_stock_news_route_returns_items_and_validates_range(self):
        item = NewsItem(
            source="eastmoney",
            title="标题",
            url="https://example.com/1",
            related_symbols=["002594.SZ"],
        )
        with patch(
            "data.router.registry.call_with_fallback",
            return_value=[item],
        ):
            response = self.client.get(
                "/api/v1/data/stock-news",
                params={"symbol": "002594.SZ", "page_size": 20},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["source"], "eastmoney")
        self.assertEqual(
            self.client.get(
                "/api/v1/data/stock-news",
                params={"symbol": "002594.SZ", "page_size": 101},
            ).status_code,
            422,
        )

    def test_market_news_and_announcement_routes(self):
        news = NewsItem(source="eastmoney_global", title="快讯", url="https://example.com/2")
        announcement = AnnouncementItem(
            source="cninfo",
            source_id="1",
            title="公告",
            published_at="2026-11-19",
            url="https://example.com/3",
        )
        with patch(
            "data.router.registry.call_with_fallback",
            side_effect=[[news], [announcement]],
        ):
            news_response = self.client.get(
                "/api/v1/data/market-news", params={"limit": 50}
            )
            announcement_response = self.client.get(
                "/api/v1/data/announcements",
                params={"symbol": "002594.SZ", "since_days": 30},
            )
        self.assertEqual(news_response.status_code, 200)
        self.assertEqual(news_response.json()[0]["source"], "eastmoney_global")
        self.assertEqual(announcement_response.status_code, 200)
        self.assertEqual(announcement_response.json()[0]["source"], "cninfo")

    def test_unsupported_explicit_source_is_rejected(self):
        response = self.client.get(
            "/api/v1/data/stock-news",
            params={"symbol": "002594.SZ", "source": "tencent"},
        )
        self.assertEqual(response.status_code, 400)

    def test_stock_news_empty_primary_uses_backup(self):
        class EmptyProvider:
            def stock_news(self, _symbol, page_size=20):
                return []

        class BackupProvider:
            def stock_news(self, _symbol, page_size=20):
                return [
                    NewsItem(
                        source="sina",
                        title="备源新闻",
                        url="https://example.com/backup",
                        related_symbols=["002594.SZ"],
                    )
                ]

        with patch(
            "data.router.registry.providers_for",
            return_value=[EmptyProvider(), BackupProvider()],
        ):
            response = self.client.get(
                "/api/v1/data/stock-news",
                params={"symbol": "002594.SZ"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["source"], "sina")


if __name__ == "__main__":
    unittest.main()
