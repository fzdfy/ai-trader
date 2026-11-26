"""Serialize internal Quant signal results into the shared JSON contract."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


def _component_to_contract(component: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "signalId": component.get("signalId", component.get("signal_id")),
        "status": component["status"],
        "value": component["value"],
    }


def signal_to_contract(signal: Mapping[str, Any]) -> dict[str, Any]:
    evidence = signal["evidence"]
    return {
        "signalId": signal["signal_id"],
        "displayName": signal.get("display_name"),
        "rule": signal.get("rule"),
        "params": signal.get("params"),
        "confirmation": signal.get("confirmation"),
        "invalidation": signal.get("invalidation"),
        "dataRequirements": [
            {
                "dataset": requirement["dataset"],
                "fields": list(requirement["fields"]),
                "minHistory": requirement["min_history"],
                "required": requirement["required"],
                "source": requirement["source"],
            }
            for requirement in signal.get("data_requirements", [])
        ],
        "scope": signal["scope"],
        "objectType": signal["object_type"],
        "objectSubtype": signal["object_subtype"],
        "objectCode": signal["object_code"],
        "status": signal["status"],
        "direction": signal["direction"],
        "value": signal["value"],
        "unit": signal["unit"],
        "quality": signal["quality"],
        "proxy": signal["proxy"],
        "sampleCount": signal["sample_count"],
        "asOf": signal["as_of"],
        "computedAt": signal["computed_at"],
        "dataSources": list(signal["data_sources"]),
        "evidence": {
            "components": [
                _component_to_contract(component)
                for component in evidence["components"]
            ],
            "notes": list(evidence["notes"]),
            "missingFields": list(evidence["missing_fields"]),
        },
        "catalogVersion": signal["catalog_version"],
        "definitionHash": signal["definition_hash"],
    }


def evaluation_to_contract(
    evaluation: Mapping[str, Any],
    extra_signals: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    return {
        "catalogVersion": evaluation["catalog_version"],
        "objectType": evaluation["object_type"],
        "objectSubtype": evaluation["object_subtype"],
        "objectCode": evaluation["object_code"],
        "asOf": evaluation["as_of"],
        "computedAt": evaluation["computed_at"],
        "inputHash": evaluation["input_hash"],
        "technical": evaluation["technical"],
        "signals": [
            signal_to_contract(signal)
            for signal in [*evaluation["signals"], *extra_signals]
        ],
    }
