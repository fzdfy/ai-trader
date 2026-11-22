import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.testclient import TestClient

from data.base import (
    CAPABILITY_MARKET_ASSET_DAILY,
    CAPABILITY_MARKET_ASSET_MINUTE,
    CAPABILITY_MARKET_ASSET_QUOTE,
    MarketProvider,
)
from data.market_assets import MARKET_ASSETS, resolve_market_asset
from data.providers.sina.provider import (
    SinaProvider,
    parse_sina_xau_daily,
    parse_sina_xau_minute,
)
from data.providers.tencent.provider import (
    TencentProvider,
    parse_tencent_market_asset_minute,
    parse_tencent_market_asset_quotes,
)
from data.providers.yahoo.provider import (
    YahooProvider,
    parse_yahoo_market_asset_bars,
)
from data.registry import capability_chains, market_asset_providers_for, providers_for
from data.router import router as data_router
from data.schemas import KlineBar, MarketAssetBar, MarketAssetQuote


class MarketAssetContractTest(unittest.TestCase):
    def test_fixed_catalog_has_exact_symbols_and_units(self):
        self.assertEqual(
            set(MARKET_ASSETS),
            {
                "000001.SH",
                "399006.SZ",
                "510300.SH",
                "588000.SH",
                "159992.SZ",
                "XAUUSD",
                "IXIC",
            },
        )
        self.assertEqual(MARKET_ASSETS["000001.SH"].price_unit, "点")
        self.assertEqual(MARKET_ASSETS["510300.SH"].price_unit, "元")
        self.assertEqual(MARKET_ASSETS["XAUUSD"].price_unit, "USD/oz")
        self.assertEqual(MARKET_ASSETS["IXIC"].session, "us_equity")
        self.assertFalse(MARKET_ASSETS["XAUUSD"].has_volume)

    def test_unknown_market_asset_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unknown market asset"):
            resolve_market_asset("SPX")

    def test_market_asset_capabilities_have_approved_chains(self):
        chains = capability_chains()
        self.assertEqual(chains[CAPABILITY_MARKET_ASSET_QUOTE], ["tencent"])
        self.assertEqual(
            chains[CAPABILITY_MARKET_ASSET_MINUTE],
            ["tencent", "sina", "yahoo"],
        )
        self.assertEqual(
            chains[CAPABILITY_MARKET_ASSET_DAILY],
            ["tencent", "sina", "yahoo"],
        )

    def test_registry_ignores_not_yet_installed_chain_members(self):
        names = [provider.name for provider in providers_for(CAPABILITY_MARKET_ASSET_MINUTE)]
        self.assertEqual(names, ["tencent", "sina", "yahoo"])

    def test_market_asset_provider_chain_is_fixed_by_asset(self):
        daily = CAPABILITY_MARKET_ASSET_DAILY
        minute = CAPABILITY_MARKET_ASSET_MINUTE
        self.assertEqual(
            [provider.name for provider in market_asset_providers_for(daily, "000001.SH")],
            ["tencent"],
        )
        self.assertEqual(
            [provider.name for provider in market_asset_providers_for(daily, "XAUUSD")],
            ["sina"],
        )
        self.assertEqual(
            [provider.name for provider in market_asset_providers_for(minute, "IXIC")],
            ["yahoo"],
        )

    def test_provider_base_methods_fail_explicitly(self):
        provider = MarketProvider()
        with self.assertRaises(NotImplementedError):
            provider.market_asset_quote(["000001.SH"])
        with self.assertRaises(NotImplementedError):
            provider.market_asset_minute(
                "000001.SH", tf="1m", limit=10, start=None, end=None
            )
        with self.assertRaises(NotImplementedError):
            provider.market_asset_daily(
                "000001.SH", limit=10, start=None, end=None
            )

    def test_schema_keeps_session_and_bucket_time(self):
        bar = MarketAssetBar(
            symbol="XAUUSD",
            session_date=date(2026, 11, 20),
            bucket_start=datetime(2026, 11, 19, 16, 0, tzinfo=timezone.utc),
            open=4030,
            high=4035,
            low=4025,
            close=4032,
            volume=None,
            amount=None,
            source="sina",
        )
        quote = MarketAssetQuote(
            symbol="XAUUSD",
            price=4032,
            pre_close=4036,
            open=4036,
            high=4038,
            low=4020,
            change_pct=-0.1,
            volume=None,
            amount=None,
            quoted_at=datetime(2026, 11, 20, 15, 0, tzinfo=timezone.utc),
            source="tencent",
            price_unit="USD/oz",
        )
        self.assertEqual(bar.session_date, date(2026, 11, 20))
        self.assertIsNone(bar.volume)
        self.assertEqual(quote.price_unit, "USD/oz")

    def test_tencent_quote_parser_accepts_spaced_cross_market_time(self):
        fields = [""] * 60
        fields[1] = "纳斯达克"
        fields[3] = "22617.73"
        fields[4] = "23879.20"
        fields[5] = "23587.38"
        fields[30] = "2026-11-20 17:15:59"
        fields[31] = "-1261.47"
        fields[32] = "-5.28"
        fields[33] = "23837.76"
        fields[34] = "22513.01"
        text = f'v_usIXIC="{"~".join(fields)}";'
        quotes = parse_tencent_market_asset_quotes(text, ["IXIC"])
        self.assertEqual(
            quotes["IXIC"].quoted_at,
            datetime(2026, 11, 20, 17, 15, 59, tzinfo=ZoneInfo("Asia/Shanghai")),
        )

    def test_tencent_xau_uses_compact_gold_quote_shape(self):
        text = (
            'v_hf_XAU="3534.64,-2.49,3534.64,3534.99,3636.63,3502.73,'
            '05:55:00,3625.01,3628.88,0,0,0,2026-11-21,伦敦金";'
        )
        quotes = parse_tencent_market_asset_quotes(text, ["XAUUSD"])
        quote = quotes["XAUUSD"]
        self.assertEqual(quote.price, 3534.64)
        self.assertEqual(quote.pre_close, 3625.01)
        self.assertEqual(quote.open, 3628.88)
        self.assertEqual(quote.high, 3636.63)
        self.assertEqual(quote.low, 3502.73)
        self.assertEqual(quote.change_pct, -2.49)
        self.assertEqual(
            quote.quoted_at,
            datetime(2026, 11, 21, 5, 55, tzinfo=ZoneInfo("Asia/Shanghai")),
        )

    def test_tencent_minute_parser_uses_cumulative_deltas(self):
        payload = {
            "data": {
                "sh000001": {
                    "data": {
                        "date": "20261120",
                        "data": [
                            "0930 3527.30 100 1000.00",
                            "0931 3532.08 250 2600.00",
                        ],
                    }
                }
            }
        }
        bars = parse_tencent_market_asset_minute(payload, "000001.SH")
        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0].session_date, date(2026, 11, 20))
        self.assertEqual(bars[0].volume, 100)
        self.assertEqual(bars[1].volume, 150)
        self.assertEqual(bars[1].amount, 1600)
        self.assertEqual(bars[1].close, 3532.08)

    def test_tencent_market_asset_daily_clamps_to_supported_page_size(self):
        provider = TencentProvider()
        requested_limits = []

        def fake_kline(symbol, tf, limit, start, end, adjust):
            requested_limits.append(limit)
            return [
                KlineBar(
                    time="2026-11-20",
                    open=100,
                    high=101,
                    low=99,
                    close=100.5,
                    volume=1000,
                    amount=None,
                )
            ]

        provider.kline = fake_kline
        bars = provider.market_asset_daily("000001.SH", limit=5000)
        self.assertEqual(requested_limits, [600])
        self.assertEqual(bars[0].source, "tencent")

    def test_sina_xau_daily_is_jsonp_and_has_no_volume(self):
        text = (
            "/*<script>location.href='//sina.com';</script>*/\n"
            'var _XAU=([{"date":"2026-11-19","open":"3719.84",'
            '"high":"3738.42","low":"3620.11","close":"3625.01",'
            '"volume":"0"}]);'
        )
        bars = parse_sina_xau_daily(text)
        self.assertEqual(len(bars), 1)
        self.assertEqual(bars[0].symbol, "XAUUSD")
        self.assertEqual(bars[0].session_date, date(2026, 11, 19))
        self.assertIsNone(bars[0].volume)
        self.assertEqual(bars[0].source, "sina")

    def test_sina_xau_minute_keeps_cross_midnight_session_date(self):
        text = (
            "/*<script>location.href='//sina.com';</script>*/\n"
            'var _XAU=({"minLine_1d":['
            '["2026-11-20","3625.010","LIFFE","","23:59","3625.010",'
            '"0","0","3625.000","2026-11-20 23:59:00"],'
            '["00:00","3624.500","0","0","3624.900",'
            '"2026-11-21 00:00:00"]'
            "]});"
        )
        bars = parse_sina_xau_minute(text)
        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0].session_date, date(2026, 11, 20))
        self.assertEqual(bars[1].session_date, date(2026, 11, 20))
        self.assertEqual(bars[1].bucket_start.isoformat(), "2026-11-21T00:00:00+08:00")
        self.assertEqual(bars[1].close, 3624.5)
        self.assertIsNone(bars[1].volume)

    def test_yahoo_ixic_parses_five_minute_bars_without_volume(self):
        first = int(datetime(2026, 11, 20, 14, 30, tzinfo=timezone.utc).timestamp())
        second = first + 300
        payload = {
            "chart": {
                "result": [
                    {
                        "meta": {
                            "exchangeTimezoneName": "America/New_York",
                            "dataGranularity": "5m",
                        },
                        "timestamp": [first, second],
                        "indicators": {
                            "quote": [
                                {
                                    "open": [100.0, 101.0],
                                    "high": [102.0, 103.0],
                                    "low": [99.0, 100.0],
                                    "close": [101.5, 102.5],
                                    "volume": [1000, 1200],
                                }
                            ]
                        },
                    }
                ],
                "error": None,
            }
        }
        bars = parse_yahoo_market_asset_bars(payload, "IXIC", "5m")
        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0].session_date, date(2026, 11, 20))
        self.assertIsNone(bars[0].volume)
        self.assertEqual(bars[1].close, 102.5)

    def test_providers_reject_assets_outside_their_market_asset_scope(self):
        with self.assertRaisesRegex(ValueError, "A 股"):
            TencentProvider().market_asset_minute(
                "XAUUSD", tf="1m", limit=10, start=None, end=None
            )
        with self.assertRaisesRegex(ValueError, "XAUUSD"):
            SinaProvider().market_asset_minute(
                "000001.SH", tf="1m", limit=10, start=None, end=None
            )
        with self.assertRaisesRegex(ValueError, "5m"):
            YahooProvider().market_asset_minute(
                "IXIC", tf="1m", limit=10, start=None, end=None
            )


class _FakeMarketAssetProvider(MarketProvider):
    name = "fake-market-assets"
    capabilities = frozenset(
        {
            CAPABILITY_MARKET_ASSET_QUOTE,
            CAPABILITY_MARKET_ASSET_MINUTE,
            CAPABILITY_MARKET_ASSET_DAILY,
        }
    )

    def market_asset_quote(self, symbols):
        return {
            symbol: MarketAssetQuote(
                symbol=symbol,
                price=100,
                pre_close=99,
                open=99,
                high=101,
                low=98,
                change_pct=1.01,
                volume=10,
                amount=1000,
                quoted_at=datetime(2026, 11, 20, 7, 0, tzinfo=timezone.utc),
                source=self.name,
                price_unit=resolve_market_asset(symbol).price_unit,
            )
            for symbol in symbols
        }

    def market_asset_minute(self, symbol, tf, limit, start, end):
        return []

    def market_asset_daily(self, symbol, limit, start, end):
        return []


class MarketAssetRouteContractTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(data_router, prefix="/api/v1/data")
        self.client = TestClient(app)
        self.provider = _FakeMarketAssetProvider()

    def test_market_asset_quotes_preserve_requested_symbols(self):
        with patch(
            "data.router.registry.providers_for",
            return_value=[self.provider],
        ):
            response = self.client.get(
                "/api/v1/data/market-assets/quotes"
                "?symbols=000001.SH,XAUUSD"
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {"000001.SH", "XAUUSD"})

    def test_unknown_quote_symbol_is_rejected(self):
        response = self.client.get(
            "/api/v1/data/market-assets/quotes?symbols=000001.SH,SPX"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("unknown market asset", response.json()["detail"])

    def test_market_asset_routes_reject_wrong_timeframe(self):
        response = self.client.get(
            "/api/v1/data/market-assets/minute?symbol=IXIC&tf=1m"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("5m", response.json()["detail"])

    def test_daily_route_rejects_unknown_symbol_before_provider_call(self):
        with patch("data.router.registry.call_with_fallback") as fallback:
            response = self.client.get(
                "/api/v1/data/market-assets/daily?symbol=SPX"
            )
        self.assertEqual(response.status_code, 400)
        fallback.assert_not_called()


if __name__ == "__main__":
    unittest.main()
