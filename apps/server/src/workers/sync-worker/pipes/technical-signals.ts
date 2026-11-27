import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "../../../db";
import { board, instrument } from "../../../db/schema";
import { catalogHash } from "../../../../../../packages/signal-catalog/src/hash.ts";
import { CATALOG_VERSION } from "../../../../../../packages/signal-catalog/src/index.ts";
import {
  quant,
  type QuantTechnicalEvaluationResponse,
  type QuantTechnicalObjectInput,
} from "../../../lib/quant";
import { getLogContext } from "../../../lib/request-context";
import {
  technicalObjectAdapter,
  type TechnicalObjectRead,
} from "../../../lib/technical-signals/adapters";
import {
  evaluateMarketAdvancedModels,
  evaluateGoldAdvancedModels,
  evaluateSectorAdvancedModels,
  evaluateStockAdvancedModels,
} from "../../../lib/technical-signals/advanced";
import type {
  MarketAdvancedContext,
  SectorAdvancedContext,
  StockAdvancedContext,
} from "../../../lib/technical-signals/advanced";
import {
  applyAssetConfirmation,
  type AssetConfirmation,
} from "../../../lib/technical-signals/evaluator";
import {
  loadMarketAdvancedContext,
  loadSectorAdvancedContext,
  loadStockAdvancedContext,
} from "../../../lib/technical-signals/contexts";
import { buildSignalJudgmentSummary } from "../../../lib/technical-signals/judgment";
import {
  upsertTechnicalSignalSnapshot,
  type TechnicalSignalSnapshotWrite,
} from "../../../lib/technical-signals/store";

export interface TechnicalPipelineObject {
  objectType: "market" | "sector" | "stock" | "gold";
  objectSubtype: "industry" | "concept" | null;
  objectCode: string;
}

export interface TechnicalPipelineDependencies {
  now: () => Date;
  readObject(object: TechnicalPipelineObject): Promise<TechnicalObjectRead>;
  readConfirmation(object: TechnicalPipelineObject): Promise<AssetConfirmation>;
  loadAdvancedContext?(
    object: TechnicalPipelineObject,
    read: TechnicalObjectRead,
  ): Promise<MarketAdvancedContext | SectorAdvancedContext | StockAdvancedContext | null>;
  evaluateQuant(input: {
    catalog_version: "technical-signals-1.0.0";
    computed_at: string;
    objects: QuantTechnicalObjectInput[];
  }): Promise<QuantTechnicalEvaluationResponse>;
  persist(write: TechnicalSignalSnapshotWrite): Promise<unknown>;
  listMarket?(): Promise<TechnicalPipelineObject[]>;
  listGold?(): Promise<TechnicalPipelineObject[]>;
  listBoards?(): Promise<TechnicalPipelineObject[]>;
  listStocks?(): Promise<TechnicalPipelineObject[]>;
}

export interface TechnicalPipelineMetrics {
  batches: number;
  objects: number;
  succeeded: number;
  failed: number;
  lowQuality: number;
  elapsedMs: number;
  errors: Array<{ objectCode: string; error: string }>;
}

const keyOf = (object: { objectType: string; objectSubtype?: string | null; objectCode: string }) =>
  `${object.objectType}|${object.objectSubtype ?? ""}|${object.objectCode}`;

const addMetrics = (target: TechnicalPipelineMetrics, source: TechnicalPipelineMetrics) => {
  target.batches += source.batches;
  target.objects += source.objects;
  target.succeeded += source.succeeded;
  target.failed += source.failed;
  target.lowQuality += source.lowQuality;
  target.elapsedMs += source.elapsedMs;
  target.errors.push(...source.errors);
};

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function evaluateWithRetry(
  dependencies: TechnicalPipelineDependencies,
  input: {
    catalog_version: "technical-signals-1.0.0";
    computed_at: string;
    objects: QuantTechnicalObjectInput[];
  },
): Promise<QuantTechnicalEvaluationResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await dependencies.evaluateQuant(input);
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function processTechnicalSignalBatches(
  objects: TechnicalPipelineObject[],
  dependencies: TechnicalPipelineDependencies,
  batchSize = 200,
): Promise<TechnicalPipelineMetrics> {
  if (batchSize < 1 || batchSize > 200) {
    throw new Error("technical signal batch size must be between 1 and 200");
  }
  const startedAt = dependencies.now().getTime();
  const metrics: TechnicalPipelineMetrics = {
    batches: 0,
    objects: objects.length,
    succeeded: 0,
    failed: 0,
    lowQuality: 0,
    elapsedMs: 0,
    errors: [],
  };
  const computedAt = dependencies.now().toISOString();

  for (let offset = 0; offset < objects.length; offset += batchSize) {
    const batch = objects.slice(offset, offset + batchSize);
    metrics.batches += 1;
    const reads: Array<{
      object: TechnicalPipelineObject;
      read: TechnicalObjectRead;
    }> = [];
    const readResults = await mapWithConcurrency(batch, 20, async (object) => {
      try {
        const read = await dependencies.readObject(object);
        if (read.bars.length === 0) {
          return {
            object,
            error: {
              objectCode: object.objectCode,
              error: "no historical bars",
            },
          };
        }
        return { object, read };
      } catch (error) {
        return {
          object,
          error: {
            objectCode: object.objectCode,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    });
    for (const result of readResults) {
      if ("read" in result && result.read) {
        reads.push({ object: result.object, read: result.read });
      } else if ("error" in result && result.error) {
        metrics.failed += 1;
        metrics.errors.push(result.error);
      }
    }
    if (reads.length === 0) continue;

    const quantInputs = reads.map(({ read }) => ({
      object_type: read.identity.objectType,
      object_subtype: read.identity.objectSubtype,
      object_code: read.identity.objectCode,
      as_of: read.asOf,
      bars: read.bars,
    }));
    let response: QuantTechnicalEvaluationResponse;
    try {
      response = await evaluateWithRetry(dependencies, {
        catalog_version: "technical-signals-1.0.0",
        computed_at: computedAt,
        objects: quantInputs,
      });
    } catch (error) {
      metrics.failed += reads.length;
      metrics.errors.push({
        objectCode: batch[0]?.objectCode ?? "batch",
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (response.catalogVersion !== CATALOG_VERSION) {
      metrics.failed += reads.length;
      metrics.errors.push({
        objectCode: batch[0]?.objectCode ?? "batch",
        error: `catalog version mismatch: ${response.catalogVersion}`,
      });
      continue;
    }

    const itemsByKey = new Map(response.items.map((item) => [keyOf(item), item]));
    for (const { object, read } of reads) {
      const item = itemsByKey.get(keyOf(object));
      if (!item) {
        metrics.failed += 1;
        metrics.errors.push({
          objectCode: object.objectCode,
          error: "Quant response omitted object",
        });
        continue;
      }
      try {
        const confirmation = await dependencies.readConfirmation(object);
        const confirmed = applyAssetConfirmation(item.signals, object.objectType, confirmation);
        const advancedOptions = {
          objectCode: object.objectCode,
          objectSubtype: object.objectSubtype,
          asOf: item.asOf,
          computedAt,
        };
        const context = (await dependencies.loadAdvancedContext?.(object, read)) ?? null;
        const advanced =
          object.objectType === "market"
            ? evaluateMarketAdvancedModels(context as MarketAdvancedContext | null, advancedOptions)
            : object.objectType === "sector"
              ? evaluateSectorAdvancedModels(
                  context as SectorAdvancedContext | null,
                  advancedOptions,
                )
              : object.objectType === "stock"
                ? evaluateStockAdvancedModels(
                    context as StockAdvancedContext | null,
                    advancedOptions,
                  )
                : evaluateGoldAdvancedModels(advancedOptions);
        const signals = [...confirmed, ...advanced];
        const quality = signals.every((signal) => signal.status === "unavailable")
          ? "missing"
          : signals.some(
                (signal) =>
                  signal.status === "low-confidence" ||
                  signal.status === "unavailable" ||
                  signal.quality === "low",
              ) || read.quality === "low"
            ? "low"
            : "available";
        await dependencies.persist({
          objectType: object.objectType,
          objectSubtype: object.objectSubtype,
          objectCode: object.objectCode,
          asOf: item.asOf,
          catalogVersion: response.catalogVersion,
          computedAt: new Date(computedAt),
          definitionHash: catalogHash,
          inputHash: item.inputHash,
          quality,
          dataSources: read.dataSources,
          signals,
          summary: buildSignalJudgmentSummary({
            objectType: object.objectType,
            signals,
          }),
        });
        metrics.succeeded += 1;
        if (quality !== "available") metrics.lowQuality += 1;
      } catch (error) {
        metrics.failed += 1;
        metrics.errors.push({
          objectCode: object.objectCode,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  metrics.elapsedMs = dependencies.now().getTime() - startedAt;
  const context = getLogContext();
  console.info(
    JSON.stringify({
      event: "technical-signals-batch-complete",
      request_id: context?.requestId ?? null,
      job_run_id: context?.jobRunId ?? null,
      catalog_version: CATALOG_VERSION,
      objects: metrics.objects,
      batches: metrics.batches,
      failed: metrics.failed,
      low_quality: metrics.lowQuality,
      elapsed_ms: metrics.elapsedMs,
    }),
  );
  return metrics;
}

export async function runTechnicalSignalJobs(
  dependencies: TechnicalPipelineDependencies,
): Promise<TechnicalPipelineMetrics> {
  if (
    !dependencies.listMarket ||
    !dependencies.listGold ||
    !dependencies.listBoards ||
    !dependencies.listStocks
  ) {
    throw new Error("technical signal job listers are required");
  }
  const startedAt = dependencies.now().getTime();
  const total: TechnicalPipelineMetrics = {
    batches: 0,
    objects: 0,
    succeeded: 0,
    failed: 0,
    lowQuality: 0,
    elapsedMs: 0,
    errors: [],
  };
  const runCategory = async (objects: TechnicalPipelineObject[]) => {
    if (objects.length > 0) {
      addMetrics(total, await processTechnicalSignalBatches(objects, dependencies));
    }
  };
  await runCategory(await dependencies.listMarket());
  await runCategory(await dependencies.listGold());
  const boards = await dependencies.listBoards();
  await runCategory(boards.filter((item) => item.objectSubtype === "industry"));
  await runCategory(boards.filter((item) => item.objectSubtype === "concept"));
  await runCategory(await dependencies.listStocks());
  total.elapsedMs = dependencies.now().getTime() - startedAt;
  return total;
}

const unavailableConfirmation = (): AssetConfirmation => ({
  available: false,
  advanceDeclineRatio: null,
  breadthChange5: null,
  leaderResonance: null,
  source: "unavailable",
});

const defaultDependencies: TechnicalPipelineDependencies = {
  now: () => new Date(),
  readObject: (object) =>
    technicalObjectAdapter.read(object.objectType, object.objectCode, object.objectSubtype, 320),
  readConfirmation: async () => unavailableConfirmation(),
  evaluateQuant: (input) => quant.evaluateTechnicalSignals(input),
  persist: (write) => upsertTechnicalSignalSnapshot(write),
  loadAdvancedContext: (object, read) =>
    object.objectType === "market"
      ? loadMarketAdvancedContext(read)
      : object.objectType === "sector"
        ? loadSectorAdvancedContext(
            {
              objectSubtype: object.objectSubtype as "industry" | "concept",
              objectCode: object.objectCode,
            },
            read,
          )
        : object.objectType === "stock"
          ? loadStockAdvancedContext(object, read)
          : Promise.resolve(null),
  listMarket: async () => [{ objectType: "market", objectSubtype: null, objectCode: "000001.SH" }],
  listGold: async () => [{ objectType: "gold", objectSubtype: null, objectCode: "XAUUSD" }],
  listBoards: async () => {
    const rows = await db
      .select({ code: board.code, type: board.type })
      .from(board)
      .where(inArray(board.type, ["industry", "concept"]))
      .orderBy(asc(board.type), asc(board.code));
    return rows.map((row) => ({
      objectType: "sector" as const,
      objectSubtype: row.type as "industry" | "concept",
      objectCode: row.code,
    }));
  },
  listStocks: async () => {
    const rows = await db
      .select({ symbol: instrument.symbol })
      .from(instrument)
      .where(
        and(
          eq(instrument.market, "CN"),
          eq(instrument.status, "listed"),
          or(
            sql`${instrument.symbol} ~ '^(60|68)[0-9]{4}\\.SH$'`,
            sql`${instrument.symbol} ~ '^(00|30)[0-9]{4}\\.SZ$'`,
            sql`${instrument.symbol} ~ '^(4|8|9)[0-9]{5}\\.BJ$'`,
          ),
        ),
      )
      .orderBy(asc(instrument.symbol));
    return rows.map((row) => ({
      objectType: "stock" as const,
      objectSubtype: null,
      objectCode: row.symbol,
    }));
  },
};

export const runTechnicalSignalsMarket = async () => {
  const startedAt = defaultDependencies.now().getTime();
  const market = await processTechnicalSignalBatches(
    await defaultDependencies.listMarket!(),
    defaultDependencies,
  );
  const gold = await processTechnicalSignalBatches(
    await defaultDependencies.listGold!(),
    defaultDependencies,
  );
  const metrics: TechnicalPipelineMetrics = {
    batches: market.batches + gold.batches,
    objects: market.objects + gold.objects,
    succeeded: market.succeeded + gold.succeeded,
    failed: market.failed + gold.failed,
    lowQuality: market.lowQuality + gold.lowQuality,
    elapsedMs: defaultDependencies.now().getTime() - startedAt,
    errors: [...market.errors, ...gold.errors],
  };
  return metrics;
};

export const runTechnicalSignalsBoards = async () => {
  const boards = await defaultDependencies.listBoards!();
  return processTechnicalSignalBatches(boards, defaultDependencies);
};

export const runTechnicalSignalsStocks = async () => {
  const objects = await defaultDependencies.listStocks!();
  return processTechnicalSignalBatches(objects, defaultDependencies);
};
