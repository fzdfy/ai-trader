import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from data.base import (
    CAPABILITY_MARKET_ASSET_DAILY,
    CAPABILITY_MARKET_ASSET_MINUTE,
    CAPABILITY_MARKET_ASSET_QUOTE,
    MarketProvider,
)
from data.market_assets import MARKET_ASSETS, resolve_market_asset
from data.registry import capability_chains, providers_for
from data.router import router as data_router
from data.schemas import MarketAssetBar, MarketAssetQuote


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
        self.assertEqual(providers_for(CAPABILITY_MARKET_ASSET_MINUTE), [])

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
