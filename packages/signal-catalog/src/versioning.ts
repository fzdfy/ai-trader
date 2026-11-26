import type { JsonValue, SignalDefinition } from "./index.ts";
import { computeDefinitionHash } from "./hash.ts";

export interface CatalogVersionSignalBaseline {
  signalId: string;
  params: Record<string, JsonValue>;
  rule: string;
  definitionHash: string;
}

export interface CatalogVersionBaseline {
  catalogVersion: string;
  signalCount: number;
  signals: CatalogVersionSignalBaseline[];
}

export const buildCatalogVersionBaseline = (
  catalogVersion: string,
  signals: readonly SignalDefinition[],
): CatalogVersionBaseline => ({
  catalogVersion,
  signalCount: signals.length,
  signals: signals.map((signal) => ({
    signalId: signal.signalId,
    params: JSON.parse(JSON.stringify(signal.params)) as Record<string, JsonValue>,
    rule: signal.rule,
    definitionHash: computeDefinitionHash(signal),
  })),
});

export interface ValidateCatalogVersionInput {
  catalogVersion: string;
  baseline: CatalogVersionBaseline;
  signals: readonly SignalDefinition[];
}

export const validateCatalogVersion = ({
  catalogVersion,
  baseline,
  signals,
}: ValidateCatalogVersionInput): void => {
  if (catalogVersion !== baseline.catalogVersion) {
    return;
  }

  const current = buildCatalogVersionBaseline(catalogVersion, signals);
  if (
    current.signalCount !== baseline.signalCount ||
    current.signals.length !== baseline.signals.length
  ) {
    throw new Error(
      `catalog version ${catalogVersion} changed its signal count; increment the catalog version`,
    );
  }

  for (let index = 0; index < current.signals.length; index += 1) {
    const currentSignal = current.signals[index];
    const baselineSignal = baseline.signals[index];
    if (
      !currentSignal ||
      !baselineSignal ||
      currentSignal.signalId !== baselineSignal.signalId ||
      currentSignal.definitionHash !== baselineSignal.definitionHash
    ) {
      throw new Error(
        `catalog version ${catalogVersion} changed signal ${currentSignal?.signalId ?? index} without incrementing the catalog version`,
      );
    }
  }
};
