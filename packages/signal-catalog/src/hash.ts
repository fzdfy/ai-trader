import { createHash } from "node:crypto";

import { CATALOG_VERSION, type JsonValue, type SignalDefinition, signals } from "./index.ts";

interface SignalDefinitionProjection {
  signal_id: string;
  layer: SignalDefinition["layer"];
  scope: SignalDefinition["scope"];
  name: string;
  definition_version: string;
  object_types: SignalDefinition["objectTypes"];
  object_subtypes: SignalDefinition["objectSubtypes"];
  availability: SignalDefinition["availability"];
  rule: string;
  params: Record<string, JsonValue>;
  confirmation: string;
  invalidation: string;
  data_requirements: Array<{
    dataset: string;
    fields: string[];
    min_history: number;
    required: boolean;
    source: string;
  }>;
}

const canonicalizeJson = (value: JsonValue): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key] as JsonValue)}`)
    .join(",")}}`;
};

const sha256 = (value: JsonValue): string =>
  createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex");

const projectionFor = (signal: SignalDefinition): SignalDefinitionProjection => ({
  signal_id: signal.signalId,
  layer: signal.layer,
  scope: signal.scope,
  name: signal.name,
  definition_version: signal.definitionVersion,
  object_types: signal.objectTypes,
  object_subtypes: signal.objectSubtypes,
  availability: signal.availability,
  rule: signal.rule,
  params: signal.params,
  confirmation: signal.confirmation,
  invalidation: signal.invalidation,
  data_requirements: signal.dataRequirements.map((requirement) => ({
    dataset: requirement.dataset,
    fields: requirement.fields,
    min_history: requirement.minHistory,
    required: requirement.required,
    source: requirement.source,
  })),
});

export const computeDefinitionHash = (signal: SignalDefinition): string =>
  sha256(projectionFor(signal) as unknown as JsonValue);

export const catalogHash = sha256({
  catalog_version: CATALOG_VERSION,
  signals: signals.map((signal) => ({
    signal_id: signal.signalId,
    definition_hash: computeDefinitionHash(signal),
  })),
});

export const goldenCatalogSnapshot = () => ({
  catalog_version: CATALOG_VERSION,
  canonicalization: "sha256:utf8-json-sorted-keys-v1",
  catalog_hash: catalogHash,
  signal_count: signals.length,
  signals: signals.map((signal) => ({
    signal_id: signal.signalId,
    params: signal.params,
    definition_hash: computeDefinitionHash(signal),
  })),
});
