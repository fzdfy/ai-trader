import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from data.base import (
    CAPABILITY_ANALYST_CONSENSUS,
    CAPABILITY_FINANCIAL_SNAPSHOT,
    CAPABILITY_FINANCIAL_STATEMENTS,
    CAPABILITY_VALUATION_HISTORY,
)
from data.providers.baostock.provider import map_baostock_valuation_rows
from data.providers.eastmoney.provider import EastmoneyProvider
from data.providers.mootdx.provider import map_mootdx_finance_snapshot
from data.providers.sina.provider import parse_sina_financial_reports
from data.providers.ths.provider import ThsProvider
from data.registry import capability_chains
from data.router import router as data_router
from data.schemas import (
    AnalystConsensusItem,
    FinancialSnapshotItem,
    ValuationDailyItem,
)


class FundamentalsProviderContractTest(unittest.TestCase):
    def test_fundamental_capabilities_have_approved_fallback_chains(self):
        chains = capability_chains()

        self.assertEqual(chains[CAPABILITY_ANALYST_CONSENSUS], ["ths", "eastmoney"])
        self.assertEqual(chains[CAPABILITY_FINANCIAL_SNAPSHOT], ["mootdx"])
        self.assertEqual(chains[CAPABILITY_FINANCIAL_STATEMENTS], ["sina"])
        self.assertEqual(chains[CAPABILITY_VALUATION_HISTORY], ["baostock"])

    def test_ths_consensus_uses_mean_column_and_institution_count(self):
        html = """
        <html><body>
          <table>
            <tr><th>年度</th><th>预测机构数</th><th>最小值</th><th>均值</th><th>最大值</th></tr>
            <tr><td>2026</td><td>18家</td><td>3.12</td><td>3.46</td><td>3.88</td></tr>
            <tr><td>2027</td><td>15家</td><td>3.81</td><td>4.25</td><td>4.76</td></tr>
          </table>
          <table>
            <tr><th>年度</th><th>预测机构数</th><th>最小值</th><th>均值</th><th>最大值</th></tr>
            <tr><td>2026</td><td>18家</td><td>300.12</td><td>346.00</td><td>388.00</td></tr>
          </table>
          <table>
            <tr><th>机构名称</th><th>研究员</th><th>预测年报每股收益</th></tr>
            <tr><td>2026预测</td><td>2027预测</td><td>2028预测</td></tr>
          </table>
        </body></html>
        """

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return html.encode("gbk")

        with patch(
            "data.providers.ths.provider.urllib.request.urlopen",
            return_value=Response(),
        ):
            items = ThsProvider().analyst_consensus(
                "002594.SZ", as_of_date="2026-11-21"
            )

        self.assertEqual(len(items), 2)
        self.assertEqual(items[0].symbol, "002594.SZ")
        self.assertEqual(items[0].as_of_date, "2026-11-21")
        self.assertEqual(items[0].fiscal_year, 2026)
        self.assertEqual(items[0].analyst_count, 18)
        self.assertEqual(items[0].eps_mean, 3.46)
        self.assertEqual(items[0].source, "ths")

    def test_sina_financial_report_extracts_period_metrics_and_yoy(self):
        payload = {
            "result": {
                "data": {
                    "report_list": {
                        "20260930": {
                            "data": [
                                {
                                    "item_title": "营业总收入",
                                    "item_value": "123,456.00",
                                    "item_tongbi": "8.5",
                                },
                                {
                                    "item_title": "净利润",
                                    "item_value": "9,876.00",
                                    "item_tongbi": None,
                                },
                            ]
                        }
                    }
                }
            }
        }

        items = parse_sina_financial_reports(
            payload, "002594.SZ", report_type="lrb"
        )

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].report_period, "2026-09-30")
        self.assertEqual(items[0].statement_type, "income_statement")
        self.assertEqual(items[0].source, "sina")
        self.assertEqual(items[0].metrics["营业总收入"], 123456.0)
        self.assertEqual(items[0].metrics["营业总收入_同比"], 8.5)
        self.assertEqual(items[0].metrics["净利润"], 9876.0)

    def test_mootdx_finance_snapshot_exposes_report_period_and_core_metrics(self):
        item = map_mootdx_finance_snapshot(
            "002594.SZ",
            {
                "code": "002594",
                "updated_date": 20260930,
                "zongguben": 2_910_000_000,
                "jinglirun": 10_000_000_000,
                "jingzichan": 100_000_000_000,
                "zhuyingshouru": 500_000_000_000,
                "zongzichan": 800_000_000_000,
                "liudongfuzhai": 300_000_000_000,
                "changqifuzhai": 100_000_000_000,
            },
        )

        self.assertEqual(item.report_period, "2026-09-30")
        self.assertEqual(item.statement_type, "snapshot")
        self.assertEqual(item.source, "mootdx")
        self.assertAlmostEqual(item.metrics["eps"], 3.4364, places=4)
        self.assertAlmostEqual(item.metrics["roe"], 10.0)
        self.assertAlmostEqual(item.metrics["debt_ratio"], 50.0)
        self.assertEqual(item.metrics["revenue"], 500_000_000_000)

    def test_mootdx_finance_snapshot_rejects_missing_report_period(self):
        with self.assertRaisesRegex(ValueError, "报告期"):
            map_mootdx_finance_snapshot(
                "002594.SZ",
                {
                    "code": "002594",
                    "zongguben": 2_910_000_000,
                    "jinglirun": 10_000_000_000,
                },
            )

    def test_eastmoney_consensus_skips_reports_with_invalid_publish_dates(self):
        response = {
            "symbol": "002594.SZ",
            "page": 1,
            "page_size": 100,
            "total": 2,
            "items": [
                {
                    "publish_date": "",
                    "institution": "脏数据机构",
                    "forecasts": [{"horizon": "current", "eps": 99.0}],
                },
                {
                    "publish_date": "2026-11-20",
                    "institution": "测试证券",
                    "forecasts": [{"horizon": "current", "eps": 4.0}],
                },
            ],
        }
        with patch("research_reports.fetch_reports", return_value=response):
            items = EastmoneyProvider().analyst_consensus(
                "002594.SZ", as_of_date="2026-11-21"
            )

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].fiscal_year, 2026)
        self.assertEqual(items[0].eps_mean, 4.0)
        self.assertEqual(items[0].analyst_count, 1)

    def test_baostock_valuation_maps_trade_status_and_st(self):
        items = map_baostock_valuation_rows(
            [
                {
                    "date": "2026-11-20",
                    "peTTM": "23.40",
                    "pbMRQ": "4.10",
                    "psTTM": "1.20",
                    "pcfNcfTTM": "-5.00",
                    "turn": "1.23",
                    "tradestatus": "1",
                    "isST": "0",
                }
            ],
            "002594.SZ",
        )

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].trade_date, "2026-11-20")
        self.assertEqual(items[0].pe_ttm, 23.4)
        self.assertEqual(items[0].pb, 4.1)
        self.assertEqual(items[0].pcf, -5.0)
        self.assertEqual(items[0].trade_status, "trading")
        self.assertFalse(items[0].is_st)
        self.assertEqual(items[0].source, "baostock")


class FundamentalsRouterTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(data_router, prefix="/api/v1/data")
        self.client = TestClient(app)

    def test_fundamental_routes_preserve_capability_contracts(self):
        consensus = AnalystConsensusItem(
            symbol="002594.SZ",
            as_of_date="2026-11-21",
            fiscal_year=2026,
            eps_mean=3.46,
            analyst_count=18,
            source="ths",
        )
        snapshot = FinancialSnapshotItem(
            symbol="002594.SZ",
            report_period="2026-09-30",
            statement_type="snapshot",
            source="mootdx",
            metrics={"eps": 3.44},
        )
        statements = FinancialSnapshotItem(
            symbol="002594.SZ",
            report_period="2026-09-30",
            statement_type="income_statement",
            source="sina",
            metrics={"净利润": 9876},
        )
        valuation = ValuationDailyItem(
            symbol="002594.SZ",
            trade_date="2026-11-20",
            pe_ttm=23.4,
            source="baostock",
        )

        with patch(
            "data.router.registry.call_with_fallback",
            side_effect=[[consensus], [snapshot], [statements], [valuation]],
        ):
            responses = [
                self.client.get(
                    "/api/v1/data/analyst-consensus",
                    params={"symbol": "002594.SZ"},
                ),
                self.client.get(
                    "/api/v1/data/financial-snapshot",
                    params={"symbol": "002594.SZ"},
                ),
                self.client.get(
                    "/api/v1/data/financial-statements",
                    params={"symbol": "002594.SZ", "periods": 8},
                ),
                self.client.get(
                    "/api/v1/data/valuation-history",
                    params={"symbol": "002594.SZ"},
                ),
            ]

        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(responses[0].json()[0]["eps_mean"], 3.46)
        self.assertEqual(responses[1].json()[0]["statement_type"], "snapshot")
        self.assertEqual(responses[2].json()[0]["source"], "sina")
        self.assertEqual(responses[3].json()[0]["trade_date"], "2026-11-20")

    def test_fundamental_routes_reject_invalid_dates(self):
        self.assertEqual(
            self.client.get(
                "/api/v1/data/analyst-consensus",
                params={"symbol": "002594.SZ", "as_of_date": "2026-13-40"},
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/data/valuation-history",
                params={"symbol": "002594.SZ", "start": "not-a-date"},
            ).status_code,
            422,
        )


if __name__ == "__main__":
    unittest.main()
