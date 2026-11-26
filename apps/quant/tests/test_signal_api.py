import json
import os
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from technical_signals.router import signals_router


FIXTURE_PATH = (
    Path(__file__).resolve().parent / "fixtures" / "technical-snapshot-v1.json"
)


class SignalEvaluationApiTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(signals_router)
        self.client = TestClient(app)
        self.bars = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))["bars"]

    def payload(self, objects):
        return {
            "catalog_version": "technical-signals-1.0.0",
            "computed_at": "2026-11-26T08:00:00.000Z",
            "objects": objects,
        }

    def stock_object(self, code="600519.SH", bars=None):
        return {
            "object_type": "stock",
            "object_subtype": None,
            "object_code": code,
            "as_of": "2026-06-29",
            "bars": bars or self.bars,
        }

    def test_rejects_an_empty_batch(self):
        response = self.client.post(
            "/api/v1/signals/evaluate", json=self.payload([])
        )
        self.assertEqual(response.status_code, 422)

    def test_internal_token_is_enforced_when_configured(self):
        os.environ["QUANT_INTERNAL_TOKEN"] = "fixture-token"
        try:
            object_payload = self.payload([self.stock_object()])
            denied = self.client.post(
                "/api/v1/signals/evaluate", json=object_payload
            )
            allowed = self.client.post(
                "/api/v1/signals/evaluate",
                json=object_payload,
                headers={"x-quant-internal-token": "fixture-token"},
            )
        finally:
            os.environ.pop("QUANT_INTERNAL_TOKEN", None)
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(allowed.status_code, 200)

    def test_rejects_more_than_two_hundred_objects(self):
        objects = [self.stock_object(f"{index:06d}.SZ") for index in range(201)]
        response = self.client.post(
            "/api/v1/signals/evaluate", json=self.payload(objects)
        )
        self.assertEqual(response.status_code, 422)

    def test_rejects_too_many_bars_for_one_object(self):
        bars = self.bars * 30
        response = self.client.post(
            "/api/v1/signals/evaluate",
            json=self.payload([self.stock_object(bars=bars)]),
        )
        self.assertEqual(response.status_code, 422)

    def test_rejects_a_batch_over_the_total_bar_budget(self):
        objects = [
            self.stock_object(
                f"{index:06d}.SZ", bars=(self.bars * 4)[:650]
            )
            for index in range(100)
        ]
        response = self.client.post(
            "/api/v1/signals/evaluate", json=self.payload(objects)
        )
        self.assertEqual(response.status_code, 422)

    def test_isolates_a_failed_object_from_successful_objects(self):
        bad_bars = [dict(bar) for bar in self.bars]
        bad_bars[-1]["high"] = bad_bars[-1]["low"] - 1
        response = self.client.post(
            "/api/v1/signals/evaluate",
            json=self.payload(
                [
                    self.stock_object(),
                    self.stock_object("000001.SZ", bad_bars),
                ]
            ),
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["catalogVersion"], "technical-signals-1.0.0")
        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["items"][0]["objectCode"], "600519.SH")
        self.assertEqual(body["items"][0]["technical"]["ma20"], 80.0433)
        self.assertEqual(
            len(
                [
                    signal
                    for signal in body["items"][0]["signals"]
                    if signal["signalId"].startswith("basic.stock.")
                ]
            ),
            10,
        )
        self.assertEqual(
            len(
                [
                    signal
                    for signal in body["items"][0]["signals"]
                    if signal["signalId"].startswith("pattern.stock.")
                ]
            ),
            12,
        )
        self.assertEqual(
            len(
                [
                    signal
                    for signal in body["items"][0]["signals"]
                    if signal["signalId"].startswith("micro.stock.")
                ]
            ),
            12,
        )
        self.assertEqual(len(body["errors"]), 1)
        self.assertEqual(body["errors"][0]["object_code"], "000001.SZ")


if __name__ == "__main__":
    unittest.main()
