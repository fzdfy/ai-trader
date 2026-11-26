import json
import math
import unittest
from pathlib import Path

from technical_signals.engine import (
    BASIC_SIGNAL_IDS,
    calculate_technical_snapshots,
    evaluate_technical_signals,
)
from technical_signals.patterns import evaluate_pattern_signals
from technical_signals.microstructure import evaluate_microstructure_signals
from technical_signals.snapshot import calculate_technical_snapshot


FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "technical-snapshot-v1.json"
)


class TechnicalSnapshotMigrationTest(unittest.TestCase):
    def test_frozen_fixture_matches_the_existing_api_shape_and_values(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        snapshot = calculate_technical_snapshot(fixture["bars"])

        self.assertIsNotNone(snapshot)
        assert snapshot is not None
        self.assertEqual(snapshot, fixture["expected"])

    def test_frozen_fixture_numbers_are_finite(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        for bar in fixture["bars"]:
            for field in ("open", "high", "low", "close", "volume", "amount"):
                self.assertTrue(math.isfinite(bar[field]))
        for field, value in fixture["expected"].items():
            if field != "asOf":
                self.assertTrue(math.isfinite(value), field)

    def test_insufficient_history_returns_no_snapshot(self):
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.assertIsNone(calculate_technical_snapshot(fixture["bars"][:59]))


class TechnicalBasicSignalTest(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def test_stock_evaluation_returns_all_ten_basic_signals(self):
        result = evaluate_technical_signals(
            self.fixture["bars"],
            object_type="stock",
            object_code="600519.SH",
            as_of="2026-06-29",
            computed_at="2026-11-26T08:00:00.000Z",
        )

        self.assertEqual(result["catalog_version"], "technical-signals-1.0.0")
        self.assertEqual(result["as_of"], "2026-06-29")
        self.assertEqual(result["technical"], self.fixture["expected"])
        self.assertEqual(
            [signal["signal_id"] for signal in result["signals"]],
            list(BASIC_SIGNAL_IDS["stock"]),
        )
        for signal in result["signals"]:
            self.assertEqual(signal["as_of"], "2026-06-29")
            if isinstance(signal["value"], (int, float)):
                self.assertTrue(math.isfinite(signal["value"]), signal["signal_id"])

        price_vs_ma = next(
            signal
            for signal in result["signals"]
            if signal["signal_id"] == "basic.stock.price_vs_ma200"
        )
        self.assertEqual(price_vs_ma["status"], "unavailable")
        self.assertIsNone(price_vs_ma["value"])

        rsi = next(
            signal
            for signal in result["signals"]
            if signal["signal_id"] == "basic.stock.rsi_state"
        )
        self.assertEqual(rsi["value"], self.fixture["expected"]["rsi14"])

    def test_gold_volume_signals_are_not_applicable(self):
        result = evaluate_technical_signals(
            self.fixture["bars"],
            object_type="gold",
            object_code="XAUUSD",
            as_of="2026-06-29",
            computed_at="2026-11-26T08:00:00.000Z",
        )
        by_id = {signal["signal_id"]: signal for signal in result["signals"]}
        self.assertEqual(by_id["basic.gold.rvol"]["status"], "not-applicable")
        self.assertEqual(by_id["basic.gold.obv_trend"]["status"], "not-applicable")
        self.assertEqual(by_id["basic.gold.rsi_state"]["status"], "triggered")

    def test_gold_accepts_null_volume_without_zero_filling(self):
        gold_bars = [
            {**bar, "volume": None, "amount": None}
            for bar in self.fixture["bars"]
        ]
        result = evaluate_technical_signals(
            gold_bars,
            object_type="gold",
            object_code="XAUUSD",
            as_of="2026-06-29",
            computed_at="2026-11-26T08:00:00.000Z",
        )
        by_id = {signal["signal_id"]: signal for signal in result["signals"]}
        self.assertEqual(by_id["basic.gold.rvol"]["status"], "not-applicable")
        self.assertEqual(by_id["basic.gold.obv_trend"]["status"], "not-applicable")
        self.assertEqual(by_id["basic.gold.rsi_state"]["value"], 80.3906)

    def test_batch_snapshot_keeps_objects_isolated(self):
        batches = calculate_technical_snapshots(
            {
                "600519.SH": self.fixture["bars"],
                "000001.SZ": self.fixture["bars"][:20],
            }
        )
        self.assertEqual(batches["600519.SH"], self.fixture["expected"])
        self.assertIsNone(batches["000001.SZ"])


def pattern_bars(closes, volumes=None):
    volumes = volumes or [1_000_000] * len(closes)
    bars = []
    for index, close in enumerate(closes):
        bars.append(
            {
                "time": f"2026-{1 + index // 28:02d}-{1 + index % 28:02d}",
                "open": close - 0.1,
                "high": close + 0.3,
                "low": close - 0.3,
                "close": close,
                "volume": volumes[index],
                "amount": volumes[index] * close,
            }
        )
    return bars


class TechnicalPatternTest(unittest.TestCase):
    def evaluate(self, closes, volumes=None):
        result = evaluate_pattern_signals(
            pattern_bars(closes, volumes),
            object_type="stock",
            object_code="600519.SH",
            as_of="2026-11-25",
            computed_at="2026-11-26T08:00:00.000Z",
        )
        return {signal["signal_id"]: signal for signal in result}

    def test_returns_all_twelve_patterns(self):
        result = self.evaluate([100 + math.sin(index / 3) * 0.5 for index in range(140)])
        self.assertEqual(len(result), 12)
        self.assertTrue(
            all(
                signal["signal_id"].startswith("pattern.stock.")
                for signal in result.values()
            )
        )

    def test_insufficient_pattern_history_is_unavailable_not_zero_or_neutral(self):
        result = self.evaluate(
            [100 + math.sin(index / 3) * 0.5 for index in range(140)]
        )
        acceleration = result["pattern.stock.acceleration"]
        self.assertEqual(acceleration["status"], "unavailable")
        self.assertIsNone(acceleration["value"])
        self.assertEqual(acceleration["quality"], "missing")

    def test_non_gold_missing_volume_cannot_complete_volume_confirmation(self):
        bars = [
            {**bar, "volume": None, "amount": None}
            for bar in pattern_bars([100 + math.sin(index / 3) * 0.5 for index in range(140)])
        ]
        result = evaluate_pattern_signals(
            bars,
            object_type="stock",
            object_code="600519.SH",
            as_of="2026-11-25",
            computed_at="2026-11-26T08:00:00.000Z",
        )
        by_id = {signal["signal_id"]: signal for signal in result}
        self.assertEqual(
            by_id["pattern.stock.platform_breakout"]["status"], "unavailable"
        )
        self.assertIsNone(by_id["pattern.stock.platform_breakout"]["value"])

    def test_breakout_with_volume_triggers_platform_breakout(self):
        closes = [100 + math.sin(index / 4) * 0.2 for index in range(139)] + [110]
        volumes = [1_000_000] * 139 + [2_000_000]
        result = self.evaluate(closes, volumes)
        self.assertEqual(result["pattern.stock.platform_breakout"]["status"], "triggered")
        self.assertEqual(
            result["pattern.stock.platform_breakout"]["direction"], "bullish"
        )

    def test_range_accumulation_requires_volume_recovery(self):
        closes = [100 + math.sin(index / 4) * 0.2 for index in range(139)] + [101]
        volumes = [1_000_000] * 135 + [300_000] * 5
        result = self.evaluate(closes, volumes)
        self.assertNotEqual(
            result["pattern.stock.range_accumulation"]["status"], "triggered"
        )

    def test_fake_breakout_invalidates_platform_breakout(self):
        closes = [100 + math.sin(index / 4) * 0.2 for index in range(138)]
        closes += [110, 104]
        volumes = [1_000_000] * 138 + [2_000_000, 1_800_000]
        result = self.evaluate(closes, volumes)
        self.assertEqual(
            result["pattern.stock.platform_breakout"]["status"], "invalidated"
        )

    def test_reclaim_after_breakout_triggers_pullback_confirmation(self):
        closes = [100 + math.sin(index / 4) * 0.2 for index in range(118)]
        closes += [110] + [104] * 18 + [111]
        volumes = [1_000_000] * 118 + [2_000_000] + [600_000] * 18 + [1_500_000]
        result = self.evaluate(closes, volumes)
        self.assertEqual(
            result["pattern.stock.pullback_confirmation"]["status"], "triggered"
        )

    def test_top_reversal_and_bearish_breakdown_are_distinct(self):
        top_closes = [90 + index * 0.2 for index in range(130)] + [111, 108, 104]
        top = self.evaluate(top_closes)
        self.assertEqual(
            top["pattern.stock.top_reversal"]["status"], "triggered"
        )

        breakdown_closes = [100 + math.sin(index / 3) * 0.3 for index in range(139)] + [90]
        breakdown = self.evaluate(breakdown_closes)
        self.assertEqual(
            breakdown["pattern.stock.bearish_breakdown"]["status"], "triggered"
        )


class TechnicalMicrostructureTest(unittest.TestCase):
    def setUp(self):
        self.bars = pattern_bars(
            [100 + math.sin(index / 3) * 0.8 for index in range(40)]
        )
        self.ticks = [
            {
                "time": f"2026-11-25T09:30:{index % 60:02d}Z",
                "price": 100 + index * 0.01,
                "volume": 1_000 + index * 10,
                "amount": (100 + index * 0.01) * (1_000 + index * 10),
                "direction": "buy" if index % 3 else "sell",
            }
            for index in range(40)
        ]

    def evaluate(self, *, ticks=None, order_book=None):
        return {
            signal["signal_id"]: signal
            for signal in evaluate_microstructure_signals(
                self.bars,
                ticks=ticks,
                order_book=order_book,
                object_code="600519.SH",
                as_of="2026-11-25",
                computed_at="2026-11-26T08:00:00.000Z",
            )
        }

    def test_returns_all_twelve_stock_microstructure_signals(self):
        result = self.evaluate()
        self.assertEqual(len(result), 12)
        self.assertTrue(all(key.startswith("micro.stock.") for key in result))

    def test_daily_only_amihud_is_low_confidence_proxy(self):
        result = self.evaluate()
        amihud = result["micro.stock.amihud"]
        self.assertNotEqual(amihud["status"], "unavailable")
        self.assertTrue(amihud["proxy"])
        self.assertEqual(amihud["quality"], "low")
        self.assertEqual(result["micro.stock.ofi"]["status"], "unavailable")

    def test_recent_ticks_produce_proxy_signals_not_high_confidence(self):
        result = self.evaluate(ticks=self.ticks)
        for signal_id in (
            "micro.stock.cvd",
            "micro.stock.kyle_lambda",
            "micro.stock.large_trade_imbalance",
            "micro.stock.vwap_deviation",
        ):
            signal = result[signal_id]
            self.assertNotEqual(signal["status"], "unavailable", signal_id)
            self.assertTrue(signal["proxy"], signal_id)
            self.assertEqual(signal["quality"], "low", signal_id)
            self.assertTrue(math.isfinite(signal["value"]), signal_id)

    def test_current_order_book_only_produces_obi_proxy(self):
        result = self.evaluate(
            order_book={"bid_depth": 1_500_000, "ask_depth": 1_000_000}
        )
        obi = result["micro.stock.obi"]
        self.assertEqual(obi["status"], "triggered")
        self.assertTrue(obi["proxy"])
        self.assertEqual(obi["quality"], "low")
        self.assertEqual(result["micro.stock.ofi"]["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
