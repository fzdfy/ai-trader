import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from report_documents import chunk_pages, needs_ocr, persist_report_pdf


class ReportDocumentsTest(unittest.TestCase):
    def test_detects_scanned_pages_by_text_density(self):
        self.assertTrue(needs_ocr("短文本"))
        self.assertFalse(needs_ocr("有效的研报正文" * 30))

    def test_chunks_pages_with_stable_page_ranges(self):
        pages = [
            {"page": 1, "text": "第一章 " + "盈利增长 " * 20},
            {"page": 2, "text": "第二章 " + "海外扩张 " * 20},
        ]
        chunks = chunk_pages(pages, max_chars=120, overlap_chars=20)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertEqual(chunks[0]["page_from"], 1)
        self.assertTrue(all(chunk["text"] for chunk in chunks))
        self.assertTrue(all(chunk["page_from"] <= chunk["page_to"] for chunk in chunks))
        self.assertEqual(
            [chunk["chunk_index"] for chunk in chunks],
            list(range(len(chunks))),
        )

    def test_persists_pdf_by_content_hash(self):
        with TemporaryDirectory() as root:
            first = persist_report_pdf(b"%PDF-test", "ABC123", "2026-11-13", root)
            second = persist_report_pdf(b"%PDF-test", "ABC123", "2026-11-13", root)
            self.assertEqual(first["storage_key"], second["storage_key"])
            self.assertTrue((Path(root) / first["storage_key"]).exists())
            self.assertEqual(first["file_size"], 9)


if __name__ == "__main__":
    unittest.main()
