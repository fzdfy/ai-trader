import json
import unittest
from pathlib import Path

from technical_signals.catalog import (
    CATALOG_VERSION,
    catalog_hash,
    compute_definition_hash,
    load_signal_catalog,
)


ROOT = Path(__file__).resolve().parents[3]
GOLDEN_PATH = ROOT / "packages/signal-catalog/fixtures/catalog.golden.json"


class SignalCatalogParityTest(unittest.TestCase):
    def test_python_catalog_matches_the_typescript_golden_fixture(self):
        fixture = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        signals = load_signal_catalog()

        self.assertEqual(fixture["catalog_version"], CATALOG_VERSION)
        self.assertEqual(
            fixture["canonicalization"], "sha256:utf8-json-sorted-keys-v1"
        )
        self.assertEqual(fixture["signal_count"], len(signals))
        self.assertEqual(fixture["catalog_hash"], catalog_hash(signals))
        self.assertEqual(
            [
                {
                    "signal_id": signal.signal_id,
                    "params": signal.params,
                    "definition_hash": compute_definition_hash(signal),
                }
                for signal in signals
            ],
            fixture["signals"],
        )


if __name__ == "__main__":
    unittest.main()
