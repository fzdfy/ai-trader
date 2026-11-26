from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Mapping, Sequence


CATALOG_VERSION = "technical-signals-1.0.0"
LAYER_ORDER = ("basic", "pattern", "advanced", "micro")
SCOPE_ORDER = ("market", "sector", "stock", "gold")
SignalLayer = Literal["basic", "pattern", "advanced", "micro"]
SignalScope = Literal["market", "sector", "stock", "gold"]

_DEFAULT_CATALOG_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "signal-catalog"
    / "catalog.json"
)


@dataclass(frozen=True)
class SignalDefinition:
    signal_id: str
    layer: str
    scope: str
    name: str
    display_name: str
    definition_version: str
    object_types: tuple[str, ...]
    object_subtypes: tuple[str, ...]
    order: int
    availability: str
    rule: str
    params: dict[str, Any]
    confirmation: str
    invalidation: str
    data_requirements: tuple[dict[str, Any], ...]


def _catalog_path() -> Path:
    override = os.environ.get("SIGNAL_CATALOG_PATH")
    return Path(override) if override else _DEFAULT_CATALOG_PATH


def _define_signal(
    layer: str,
    scope: str,
    definition: Mapping[str, Any],
    order: int,
) -> SignalDefinition:
    availability = (
        "not-applicable"
        if scope in definition.get("unsupported_scopes", [])
        else definition["availability"]
    )
    return SignalDefinition(
        signal_id=f"{layer}.{scope}.{definition['name']}",
        layer=layer,
        scope=scope,
        name=definition["name"],
        display_name=definition["display_name"],
        definition_version=CATALOG_VERSION,
        object_types=(scope,),
        object_subtypes=("concept", "industry") if scope == "sector" else (),
        order=order,
        availability=availability,
        rule=definition["rule"],
        params=dict(definition["params"]),
        confirmation=definition["confirmation"],
        invalidation=definition["invalidation"],
        data_requirements=tuple(
            {
                "dataset": requirement["dataset"],
                "fields": list(requirement["fields"]),
                "min_history": requirement["min_history"],
                "required": requirement["required"],
                "source": requirement["source"],
            }
            for requirement in definition["data_requirements"]
        ),
    )


def _load_raw(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("catalog_version") != CATALOG_VERSION:
        raise ValueError(
            "catalog version mismatch: "
            f"expected {CATALOG_VERSION}, received {data.get('catalog_version')}"
        )
    if tuple(data.get("layer_order", ())) != LAYER_ORDER:
        raise ValueError("catalog layer order does not match the shared contract")
    if tuple(data.get("scope_order", ())) != SCOPE_ORDER:
        raise ValueError("catalog scope order does not match the shared contract")
    return data


def load_signal_catalog(path: str | Path | None = None) -> tuple[SignalDefinition, ...]:
    data = _load_raw(Path(path) if path else _catalog_path())
    signals: list[SignalDefinition] = []

    for layer in ("basic", "pattern"):
        for scope in SCOPE_ORDER:
            signals.extend(
                _define_signal(layer, scope, definition, index)
                for index, definition in enumerate(data["shared"][layer])
            )

    for scope in SCOPE_ORDER:
        signals.extend(
            _define_signal("advanced", scope, definition, index)
            for index, definition in enumerate(data["advanced"][scope])
        )

    signals.extend(
        _define_signal("micro", "stock", definition, index)
        for index, definition in enumerate(data["micro"]["stock"])
    )

    expected_layer_counts = {
        "basic": 40,
        "pattern": 48,
        "advanced": 40,
        "micro": 12,
    }
    if len(signals) != 140:
        raise ValueError(f"catalog must contain 140 signals, received {len(signals)}")
    if len({signal.signal_id for signal in signals}) != len(signals):
        raise ValueError("catalog signal IDs must be unique")
    for layer, expected_count in expected_layer_counts.items():
        count = sum(signal.layer == layer for signal in signals)
        if count != expected_count:
            raise ValueError(
                f"{layer} catalog must contain {expected_count} signals, "
                f"received {count}"
            )

    return tuple(signals)


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _definition_projection(signal: SignalDefinition) -> dict[str, Any]:
    return {
        "signal_id": signal.signal_id,
        "layer": signal.layer,
        "scope": signal.scope,
        "name": signal.name,
        "definition_version": signal.definition_version,
        "object_types": list(signal.object_types),
        "object_subtypes": list(signal.object_subtypes),
        "availability": signal.availability,
        "rule": signal.rule,
        "params": signal.params,
        "confirmation": signal.confirmation,
        "invalidation": signal.invalidation,
        "data_requirements": list(signal.data_requirements),
    }


def compute_definition_hash(signal: SignalDefinition) -> str:
    return _sha256(_definition_projection(signal))


def catalog_hash(signals: Sequence[SignalDefinition] | None = None) -> str:
    current_signals = tuple(signals) if signals is not None else load_signal_catalog()
    return _sha256(
        {
            "catalog_version": CATALOG_VERSION,
            "signals": [
                {
                    "signal_id": signal.signal_id,
                    "definition_hash": compute_definition_hash(signal),
                }
                for signal in current_signals
            ],
        }
    )
