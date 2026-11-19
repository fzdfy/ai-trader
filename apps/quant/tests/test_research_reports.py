import unittest

from research_reports import map_report_row, safe_pdf_url


class ResearchReportMappingTest(unittest.TestCase):
    def test_maps_eastmoney_report_fields(self):
        item = map_report_row(
            "002594.SZ",
            {
                "infoCode": "ABC123",
                "title": "Q3 盈利持续向好",
                "orgSName": "中航证券",
                "researcher": "张三,李四",
                "emRatingName": "买入",
                "industryName": "新能源汽车",
                "publishDate": "2026-11-13 00:00:00",
                "predictThisYearEps": "4.00",
                "predictNextYearEps": "5.00",
                "predictNextTwoYearEps": "5.80",
                "pdfUrl": "https://pdf.dfcfw.com/pdf/H3_ABC123_1.pdf",
            },
        )
        self.assertEqual(item["source"], "eastmoney")
        self.assertEqual(item["source_id"], "ABC123")
        self.assertEqual(item["symbol"], "002594.SZ")
        self.assertEqual(item["publish_date"], "2026-11-13")
        self.assertEqual(item["analysts"], ["张三", "李四"])
        self.assertEqual(item["forecasts"][1]["horizon"], "next")
        self.assertEqual(item["forecasts"][1]["eps"], 5.0)

    def test_builds_pdf_url_and_rejects_foreign_hosts(self):
        self.assertEqual(
            safe_pdf_url("ABC123", None),
            "https://pdf.dfcfw.com/pdf/H3_ABC123_1.pdf",
        )
        self.assertIsNone(safe_pdf_url("ABC123", "https://example.com/report.pdf"))
        self.assertIsNone(safe_pdf_url("../", None))


if __name__ == "__main__":
    unittest.main()
