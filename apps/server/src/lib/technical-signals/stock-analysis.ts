import type {
  SignalResult,
  SignalStatus,
} from "../../../../../packages/signal-catalog/src/contracts.ts";
import { CATALOG_VERSION } from "../../../../../packages/signal-catalog/src/index.ts";
import type { TechnicalSnapshot } from "../stock-analysis-data";
import { quant } from "../quant";
import { evaluateStockAdvancedModels } from "./advanced";
import type { StockAdvancedContext } from "./advanced";
import type { TechnicalSignalBar } from "./adapters";

type QuantTechnical = Omit<TechnicalSnapshot, "asOf"> & { asOf: string };

export interface StockTechnicalModule {
  catalogVersion: string;
  asOf: string;
  computedAt: string;
  inputHash: string;
  quality: "available" | "low" | "missing";
  counts: Record<SignalStatus, number>;
  technical: TechnicalSnapshot | null;
  signals: SignalResult[];
}

interface QuantTechnicalResponse {
  catalogVersion: string;
  asOf: string;
  inputHash: string;
  technical: QuantTechnical | null;
  signals: SignalResult[];
  errors: Array<{ error: string }>;
}

export interface BuildStockTechnicalSignalInput {
  symbol: string;
  hfqBars: TechnicalSignalBar[];
  qfqBars: TechnicalSignalBar[];
  computedAt: string;
  advancedContext?: StockAdvancedContext | null;
  evaluateQuant?: (input: {
    object_code: string;
    bars: TechnicalSignalBar[];
  }) => Promise<QuantTechnicalResponse>;
}

const countSignals = (signals: readonly SignalResult[]) =>
  Object.fromEntries(
    ["triggered", "neutral", "invalidated", "low-confidence", "unavailable", "not-applicable"].map(
      (status) => [status, signals.filter((signal) => signal.status === status).length],
    ),
  ) as Record<SignalStatus, number>;

export async function buildStockTechnicalSignalModule(
  input: BuildStockTechnicalSignalInput,
): Promise<StockTechnicalModule> {
  const evaluateQuant =
    input.evaluateQuant ??
    (async (request: { object_code: string; bars: TechnicalSignalBar[] }) => {
      if (request.bars.length === 0) {
        return {
          catalogVersion: CATALOG_VERSION,
          asOf: "",
          inputHash: "",
          technical: null,
          signals: [],
          errors: [],
        };
      }
      const response = await quant.evaluateTechnicalSignals({
        catalog_version: "technical-signals-1.0.0",
        computed_at: input.computedAt,
        objects: [
          {
            object_type: "stock",
            object_subtype: null,
            object_code: request.object_code,
            as_of: request.bars.at(-1)?.time.slice(0, 10) ?? null,
            bars: request.bars,
          },
        ],
      });
      const [item] = response.items;
      return {
        catalogVersion: response.catalogVersion,
        asOf: item?.asOf ?? "",
        inputHash: item?.inputHash ?? "",
        technical: item?.technical as QuantTechnical | null,
        signals: item?.signals ?? [],
        errors: response.errors,
      };
    });

  const response = await evaluateQuant({
    object_code: input.symbol,
    bars: input.hfqBars,
  });
  if (response.catalogVersion !== CATALOG_VERSION) {
    throw new Error(`catalog version mismatch: ${response.catalogVersion}`);
  }
  if (response.errors.length > 0) {
    throw new Error(response.errors.map((error) => error.error).join("; "));
  }
  const hfqAsOf = response.asOf.slice(0, 10);
  const alignedQfqBars = input.qfqBars.filter((bar) => bar.time.slice(0, 10) <= hfqAsOf);
  const displayResponse =
    alignedQfqBars.length > 0
      ? await evaluateQuant({
          object_code: input.symbol,
          bars: alignedQfqBars,
        })
      : response;
  if (displayResponse.catalogVersion !== CATALOG_VERSION) {
    throw new Error(`display catalog version mismatch: ${displayResponse.catalogVersion}`);
  }
  if (displayResponse.errors.length > 0) {
    throw new Error(displayResponse.errors.map((error) => error.error).join("; "));
  }
  if (displayResponse !== response && displayResponse.asOf.slice(0, 10) !== hfqAsOf) {
    throw new Error(`HFQ/QFQ business date mismatch: ${hfqAsOf} vs ${displayResponse.asOf}`);
  }
  const technical = displayResponse.technical as TechnicalSnapshot | null;
  const advanced = evaluateStockAdvancedModels(input.advancedContext ?? null, {
    objectCode: input.symbol,
    asOf: response.asOf,
    computedAt: input.computedAt,
  });
  const signals = [...response.signals, ...advanced];
  return {
    catalogVersion: response.catalogVersion,
    asOf: response.asOf,
    computedAt: input.computedAt,
    inputHash: response.inputHash,
    quality: technical == null ? "low" : "available",
    counts: countSignals(signals),
    technical,
    signals,
  };
}
