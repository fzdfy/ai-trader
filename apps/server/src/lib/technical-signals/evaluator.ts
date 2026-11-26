import type { SignalResult } from "../../../../../packages/signal-catalog/src/contracts.ts";
import { CATALOG_VERSION } from "../../../../../packages/signal-catalog/src/index.ts";
import { quant, type QuantTechnicalEvaluation, type QuantTechnicalObjectInput } from "../quant";
import type { TechnicalObjectRead } from "./adapters";

export interface AssetConfirmation {
  available: boolean;
  advanceDeclineRatio: number | null;
  breadthChange5: number | null;
  leaderResonance: boolean | null;
  source: string;
}

const unavailableConfirmation = (): AssetConfirmation => ({
  available: false,
  advanceDeclineRatio: null,
  breadthChange5: null,
  leaderResonance: null,
  source: "unavailable",
});

const confirmationAgrees = (
  objectType: "market" | "sector",
  direction: SignalResult["direction"],
  confirmation: AssetConfirmation,
): boolean => {
  if (!confirmation.available) return false;
  const positive =
    (confirmation.advanceDeclineRatio ?? 0) >= 0.55 ||
    (confirmation.breadthChange5 ?? 0) > 0 ||
    (objectType === "sector" && confirmation.leaderResonance === true);
  const negative =
    (confirmation.advanceDeclineRatio ?? 1) <= 0.45 ||
    (confirmation.breadthChange5 ?? 0) < 0 ||
    (objectType === "sector" && confirmation.leaderResonance === false);
  return direction === "bullish" ? positive : direction === "bearish" ? negative : true;
};

export function applyAssetConfirmation(
  signals: readonly SignalResult[],
  objectType: SignalResult["objectType"],
  confirmation: AssetConfirmation,
): SignalResult[] {
  if (objectType !== "market" && objectType !== "sector") {
    return [...signals];
  }
  return signals.map((signal) => {
    if (
      !signal.signalId.startsWith("pattern.") ||
      signal.status === "neutral" ||
      signal.status === "not-applicable" ||
      signal.status === "low-confidence"
    ) {
      return signal;
    }
    const note =
      objectType === "market"
        ? "A 股市场宽度确认不足，单根指数 K 线不能独立完成形态确认"
        : confirmation.leaderResonance
          ? "板块形态已获得龙头与广度共振确认"
          : "板块形态缺少成分股广度或龙头共振确认";
    if (confirmationAgrees(objectType, signal.direction, confirmation)) {
      return {
        ...signal,
        evidence: {
          ...signal.evidence,
          notes: [...signal.evidence.notes, note],
        },
      };
    }
    return {
      ...signal,
      status: "low-confidence",
      quality: "low",
      evidence: {
        ...signal.evidence,
        notes: [...signal.evidence.notes, note],
        missingFields: [
          ...new Set([
            ...signal.evidence.missingFields,
            objectType === "sector" ? "constituent_breadth" : "market_breadth",
          ]),
        ],
      },
    };
  });
}

export interface EvaluateObjectTechnicalSignalsDependencies {
  computedAt: string;
  evaluateQuant?: (input: QuantTechnicalObjectInput) => Promise<{
    catalogVersion: string;
    asOf?: string;
    inputHash?: string;
    technical: Record<string, unknown> | null;
    signals: SignalResult[];
    errors: Array<{ error: string }>;
  }>;
  readConfirmation?: (read: TechnicalObjectRead) => Promise<AssetConfirmation>;
}

export interface EvaluatedTechnicalObject extends Omit<QuantTechnicalEvaluation, "signals"> {
  signals: SignalResult[];
  priceBasis: TechnicalObjectRead["priceBasis"];
  volumeApplicable: boolean;
  dataSources: string[];
  quality: TechnicalObjectRead["quality"];
  confirmation: AssetConfirmation;
}

export async function evaluateObjectTechnicalSignals(
  read: TechnicalObjectRead,
  dependencies: EvaluateObjectTechnicalSignalsDependencies,
): Promise<EvaluatedTechnicalObject> {
  const evaluateQuant =
    dependencies.evaluateQuant ??
    (async (input: QuantTechnicalObjectInput) => {
      const response = await quant.evaluateTechnicalSignals({
        catalog_version: "technical-signals-1.0.0",
        computed_at: dependencies.computedAt,
        objects: [input],
      });
      const [item] = response.items;
      return {
        catalogVersion: response.catalogVersion,
        asOf: item?.asOf,
        inputHash: item?.inputHash,
        technical: item?.technical ?? null,
        signals: item?.signals ?? [],
        errors: response.errors,
      };
    });
  const input: QuantTechnicalObjectInput = {
    object_type: read.identity.objectType,
    object_subtype: read.identity.objectSubtype,
    object_code: read.identity.objectCode,
    as_of: read.asOf,
    bars: read.bars,
  };
  const response = await evaluateQuant(input);
  if (response.catalogVersion !== CATALOG_VERSION) {
    throw new Error(`Quant catalog version mismatch: ${response.catalogVersion}`);
  }
  if (response.errors.length > 0) {
    throw new Error(response.errors.map((error) => error.error).join("; "));
  }
  const confirmation = dependencies.readConfirmation
    ? await dependencies.readConfirmation(read)
    : unavailableConfirmation();
  return {
    catalogVersion: response.catalogVersion,
    objectType: read.identity.objectType,
    objectSubtype: read.identity.objectSubtype,
    objectCode: read.identity.objectCode,
    asOf: response.asOf ?? read.asOf ?? "",
    computedAt: dependencies.computedAt,
    inputHash: response.inputHash ?? "",
    technical: response.technical,
    signals: applyAssetConfirmation(response.signals, read.identity.objectType, confirmation),
    priceBasis: read.priceBasis,
    volumeApplicable: read.volumeApplicable,
    dataSources: read.dataSources,
    quality: read.quality,
    confirmation,
  };
}
