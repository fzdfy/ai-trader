"""Regenerate the frozen TechnicalSnapshot migration fixture."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path


def main() -> None:
    start = date(2026, 1, 1)
    bars = []
    for index in range(180):
        close = 72 + index * 0.05 + __import__("math").sin(index / 4) * 1.8
        bars.append(
            {
                "time": (start + timedelta(days=index)).isoformat(),
                "open": round(close - 0.4, 10),
                "high": round(close + 0.9, 10),
                "low": round(close - 1.1, 10),
                "close": round(close, 10),
                "volume": 1_000_000 + index * 1_000,
                "amount": 80_000_000 + index * 50_000,
            }
        )

    fixture = {
        "fixture_version": "technical-snapshot-v1",
        "bars": bars,
        "expected": {
            "asOf": "2026-06-29",
            "close": 82.2000716584,
            "ma5": 81.2969,
            "ma10": 80.2458,
            "ma20": 80.0433,
            "ma60": 79.4031,
            "rsi14": 80.3906,
            "atr14": 2,
            "volatility20": 6.8145,
            "support20": 77.5734,
            "resistance60": 83.1001,
            "change20": 0.8015,
            "change60": 7.9334,
            "maxDrawdown60": -3.7127,
        },
    }
    output = Path(__file__).with_name("technical-snapshot-v1.json")
    output.write_text(
        json.dumps(fixture, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
