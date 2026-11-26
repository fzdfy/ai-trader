import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from data.index_rotation import (
    MAIN_INDEX_ASSETS,
    fetch_main_index_history,
    fetch_growth_defense_history,
    parse_csindex_daily,
    parse_tencent_index_daily,
)
from data.router import router as data_router


class IndexRotationParserTest(unittest.TestCase):
    def test_parses_csindex_930955_daily(self):
        payload = {
            "code": "200",
            "success": True,
            "data": [
                {
                    "tradeDate": "20261121",
                    "open": 11702.9,
                    "high": 11724.6,
                    "low": 11580.1,
                    "close": 11656.23,
                    "tradingVol": 7.1e9,
                    "tradingValue": 900.1,
                },
                {
                    "tradeDate": "20261123",
                    "open": 11650.0,
                    "high": 11780.0,
                    "low": 11600.0,
                    "close": 11720.5,
                    "tradingVol": 8.2e9,
                    "tradingValue": 950.0,
                },
            ],
        }

        bars = parse_csindex_daily(payload, "930955.CSI")

        self.assertEqual([bar.trade_date for bar in bars], ["2026-11-21", "2026-11-23"])
        self.assertEqual(bars[-1].symbol, "930955.CSI")
        self.assertEqual(bars[-1].close, 11720.5)
        self.assertEqual(bars[-1].source, "csindex")

    def test_parses_tencent_399673_daily(self):
        payload = {
            "code": 0,
            "data": {
                "sz399673": {
                    "day": [
                        ["2026-11-05", "2501.420", "2453.470", "2636.320", "2428.270", "30339829.000"],
                        ["2026-11-06", "2428.270", "2453.470", "2493.390", "2428.270", "23372970.000"],
                    ]
                }
            },
        }

        bars = parse_tencent_index_daily(payload, "399673.SZ")

        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[-1].trade_date, "2026-11-06")
        self.assertEqual(bars[-1].open, 2428.27)
        self.assertEqual(bars[-1].high, 2493.39)
        self.assertEqual(bars[-1].low, 2428.27)
        self.assertEqual(bars[-1].close, 2453.47)
        self.assertEqual(bars[-1].source, "tencent")

    def test_rejects_empty_or_malformed_payload(self):
        with self.assertRaisesRegex(ValueError, "空"):
            parse_csindex_daily({"success": True, "data": []}, "930955.CSI")
        with self.assertRaisesRegex(ValueError, "格式"):
            parse_tencent_index_daily({"data": {}}, "399673.SZ")

    def test_partial_index_source_failure_keeps_other_source(self):
        bar = parse_csindex_daily(
            {
                "success": True,
                "data": [
                    {
                        "tradeDate": "20261123",
                        "open": 1,
                        "high": 2,
                        "low": 1,
                        "close": 2,
                    }
                ],
            },
            "930955.CSI",
        )
        with (
            patch("data.index_rotation.fetch_tencent_399673_daily", side_effect=RuntimeError("timeout")),
            patch("data.index_rotation.fetch_csindex_daily", return_value=bar),
        ):
            result = fetch_growth_defense_history("2026-11-01", "2026-11-24")
        self.assertEqual(len(result["bars"]), 1)
        self.assertEqual(result["errors"][0]["symbol"], "399673.SZ")

    def test_main_index_catalog_uses_the_approved_order_and_provider_symbols(self):
        self.assertEqual(
            list(MAIN_INDEX_ASSETS),
            [
                "000001.SH",
                "000300.SH",
                "000905.SH",
                "000852.SH",
                "399673.SZ",
                "000688.SH",
                "930955.CSI",
            ],
        )
        self.assertEqual(MAIN_INDEX_ASSETS["000300.SH"].provider_symbol, "sh000300")
        self.assertEqual(MAIN_INDEX_ASSETS["930955.CSI"].provider_symbol, "930955")

    def test_parses_tencent_main_index_with_its_market_prefix(self):
        payload = {
            "data": {
                "sh000300": {
                    "day": [
                        ["2026-11-21", "3960", "3963.82", "3970", "3950", "100"],
                    ]
                }
            }
        }

        bars = parse_tencent_index_daily(payload, "000300.SH")

        self.assertEqual(bars[0].symbol, "000300.SH")
        self.assertEqual(bars[0].close, 3963.82)

    def test_main_index_history_keeps_six_indices_when_csindex_fails(self):
        bars = [
            [parse_tencent_index_daily(
                {
                    "data": {
                        MAIN_INDEX_ASSETS[symbol].provider_symbol: {
                            "day": [
                                ["2026-11-21", "1", "2", "2", "1", "10"],
                            ]
                        }
                    }
                },
                symbol,
            )[0]]
            for symbol in MAIN_INDEX_ASSETS
            if symbol != "930955.CSI"
        ]
        with (
            patch("data.index_rotation.fetch_tencent_index_daily", side_effect=bars),
            patch("data.index_rotation.fetch_csindex_daily", side_effect=RuntimeError("timeout")),
        ):
            result = fetch_main_index_history("2026-11-01", "2026-11-24")
        self.assertEqual(len(result["bars"]), 6)
        self.assertEqual(result["errors"][0]["symbol"], "930955.CSI")


class MainIndexRouteTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(data_router, prefix="/api/v1/data")
        self.client = TestClient(app)

    @patch("data.router.fetch_main_index_history")
    def test_main_index_route_forwards_validated_dates(self, fetch):
        payload = {"bars": [], "errors": []}
        fetch.return_value = payload

        response = self.client.get(
            "/api/v1/data/main-indices/daily",
            params={"start": "2026-11-01", "end": "2026-11-24"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)
        fetch.assert_called_once_with("2026-11-01", "2026-11-24")


if __name__ == "__main__":
    unittest.main()
