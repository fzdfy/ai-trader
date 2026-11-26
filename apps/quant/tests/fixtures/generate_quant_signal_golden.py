"""Regenerate the cross-language Quant evaluate response fixture."""

from __future__ import annotations

import json
from pathlib import Path

from technical_signals.engine import evaluate_technical_signals
from technical_signals.microstructure import evaluate_microstructure_signals
from technical_signals.patterns import evaluate_pattern_signals
from technical_signals.serialization import evaluation_to_contract


def main() -> None:
    fixture_dir = Path(__file__).resolve().parent
    snapshot_fixture = json.loads(
        (fixture_dir / "technical-snapshot-v1.json").read_text(encoding="utf-8")
    )
    bars = snapshot_fixture["bars"]
    computed_at = "2026-11-26T08:00:00.000Z"
    evaluation = evaluate_technical_signals(
        bars,
        object_type="stock",
        object_code="600519.SH",
        as_of="2026-06-29",
        computed_at=computed_at,
    )
    patterns = evaluate_pattern_signals(
        bars,
        object_type="stock",
        object_code="600519.SH",
        as_of="2026-06-29",
        computed_at=computed_at,
    )
    micro = evaluate_microstructure_signals(
        bars,
        object_code="600519.SH",
        as_of="2026-06-29",
        computed_at=computed_at,
    )
    response = evaluation_to_contract(evaluation, [*patterns, *micro])
    output = (
        Path(__file__).resolve().parents[4]
        / "packages"
        / "signal-catalog"
        / "fixtures"
        / "quant-evaluate-response.golden.json"
    )
    output.write_text(
        json.dumps(response, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
