import catalogData from "../catalog.json" with { type: "json" };

export const CATALOG_VERSION = "technical-signals-1.0.0";
export const SIGNAL_LAYERS = ["basic", "pattern", "advanced", "micro"] as const;
export const SIGNAL_SCOPES = ["market", "sector", "stock", "gold"] as const;

export type SignalLayer = (typeof SIGNAL_LAYERS)[number];
export type SignalScope = (typeof SIGNAL_SCOPES)[number];
export type SignalAvailability = "available" | "partial" | "unavailable" | "not-applicable";
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface SignalDataRequirement {
  dataset: string;
  fields: string[];
  minHistory: number;
  required: boolean;
  source: string;
}

export interface SignalDefinition {
  signalId: string;
  layer: SignalLayer;
  scope: SignalScope;
  name: string;
  displayName: string;
  definitionVersion: string;
  objectTypes: SignalScope[];
  objectSubtypes: Array<"industry" | "concept">;
  order: number;
  availability: SignalAvailability;
  rule: string;
  params: Record<string, JsonValue>;
  confirmation: string;
  invalidation: string;
  dataRequirements: SignalDataRequirement[];
}

interface RawSignalDefinition {
  name: string;
  display_name: string;
  availability: SignalAvailability;
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
  unsupported_scopes: SignalScope[];
}

interface RawCatalogData {
  catalog_version: string;
  layer_order: SignalLayer[];
  scope_order: SignalScope[];
  shared: Record<"basic" | "pattern", RawSignalDefinition[]>;
  advanced: Record<SignalScope, RawSignalDefinition[]>;
  micro: Record<"stock", RawSignalDefinition[]>;
}

const rawCatalog = catalogData as unknown as RawCatalogData;

if (rawCatalog.catalog_version !== CATALOG_VERSION) {
  throw new Error(
    `catalog version mismatch: expected ${CATALOG_VERSION}, received ${rawCatalog.catalog_version}`,
  );
}

const mappedDataRequirements = (
  requirements: RawSignalDefinition["data_requirements"],
): SignalDataRequirement[] =>
  requirements.map((requirement) => ({
    dataset: requirement.dataset,
    fields: [...requirement.fields],
    minHistory: requirement.min_history,
    required: requirement.required,
    source: requirement.source,
  }));

const defineSignal = (
  layer: SignalLayer,
  scope: SignalScope,
  definition: RawSignalDefinition,
  order: number,
): SignalDefinition => ({
  signalId: `${layer}.${scope}.${definition.name}`,
  layer,
  scope,
  name: definition.name,
  displayName: definition.display_name,
  definitionVersion: CATALOG_VERSION,
  objectTypes: [scope],
  objectSubtypes: scope === "sector" ? ["concept", "industry"] : [],
  order,
  availability: definition.availability,
  rule: definition.rule,
  params: JSON.parse(JSON.stringify(definition.params)) as Record<string, JsonValue>,
  confirmation: definition.confirmation,
  invalidation: definition.invalidation,
  dataRequirements: mappedDataRequirements(definition.data_requirements),
});

const expandSharedLayer = (layer: "basic" | "pattern"): SignalDefinition[] =>
  rawCatalog.scope_order.flatMap((scope) =>
    rawCatalog.shared[layer].map((definition, index) => {
      const expanded = defineSignal(layer, scope, definition, index);
      if (definition.unsupported_scopes.includes(scope)) {
        return { ...expanded, availability: "not-applicable" as const };
      }
      return expanded;
    }),
  );

const expandScopedLayer = (layer: "advanced" | "micro"): SignalDefinition[] =>
  layer === "advanced"
    ? rawCatalog.scope_order.flatMap((scope) =>
        rawCatalog.advanced[scope].map((definition, index) =>
          defineSignal(layer, scope, definition, index),
        ),
      )
    : rawCatalog.micro.stock.map((definition, index) =>
        defineSignal(layer, "stock", definition, index),
      );

export const signals: readonly SignalDefinition[] = Object.freeze([
  ...expandSharedLayer("basic"),
  ...expandSharedLayer("pattern"),
  ...expandScopedLayer("advanced"),
  ...expandScopedLayer("micro"),
]);

const EXPECTED_LAYER_COUNTS: Record<SignalLayer, number> = {
  basic: 40,
  pattern: 48,
  advanced: 40,
  micro: 12,
};

const layerCounts = Object.fromEntries(
  SIGNAL_LAYERS.map((layer) => [layer, signals.filter((signal) => signal.layer === layer).length]),
) as Record<SignalLayer, number>;

if (signals.length !== 140) {
  throw new Error(`catalog must contain 140 signals, received ${signals.length}`);
}

for (const layer of SIGNAL_LAYERS) {
  if (layerCounts[layer] !== EXPECTED_LAYER_COUNTS[layer]) {
    throw new Error(
      `${layer} catalog must contain ${EXPECTED_LAYER_COUNTS[layer]} signals, received ${layerCounts[layer]}`,
    );
  }
}

if (new Set(signals.map((signal) => signal.signalId)).size !== signals.length) {
  throw new Error("catalog signal IDs must be unique");
}

const signalsByLayer = new Map<SignalLayer, readonly SignalDefinition[]>(
  SIGNAL_LAYERS.map((layer) => [
    layer,
    Object.freeze(signals.filter((signal) => signal.layer === layer)),
  ]),
);

export interface SignalCatalog {
  catalogVersion: string;
  layerOrder: readonly SignalLayer[];
  scopeOrder: readonly SignalScope[];
  signals: readonly SignalDefinition[];
}

export const catalog: SignalCatalog = Object.freeze({
  catalogVersion: CATALOG_VERSION,
  layerOrder: SIGNAL_LAYERS,
  scopeOrder: SIGNAL_SCOPES,
  signals,
});

export const getSignalsByLayer = (layer: SignalLayer): readonly SignalDefinition[] => {
  const matchingSignals = signalsByLayer.get(layer);
  if (!matchingSignals) {
    throw new Error(`unknown signal layer: ${layer}`);
  }
  return matchingSignals;
};
