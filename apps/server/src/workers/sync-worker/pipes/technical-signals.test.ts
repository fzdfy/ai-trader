import assert from "node:assert/strict";
import test from "node:test";

import type { SignalResult } from "../../../../../../packages/signal-catalog/src/contracts.ts";
import type { TechnicalObjectRead } from "../../../lib/technical-signals/adapters.ts";
import {
  processTechnicalSignalBatches,
  runTechnicalSignalJobs,
  type TechnicalPipelineDependencies,
  type TechnicalPipelineObject,
} from "./technical-signals.ts";
import { CRON_JOBS } from "../cron-config.ts";

const computedAt = "2026-11-26T08:00:00.000Z";
const stockRef = (index: number): TechnicalPipelineObject => ({
  objectType: "stock",
  objectSubtype: null,
  objectCode: `${String(index).padStart(6, "0")}.SZ`,
});

const signal = (object: TechnicalPipelineObject): SignalResult => ({
  signalId: `basic.${object.objectType}.price_vs_ma200`,
  displayName: "价格相对 MA200",
  rule: "fixture rule",
  params: { fixture: true },
  confirmation: "fixture confirmation",
  invalidation: "fixture invalidation",
  dataRequirements: [
    {
      dataset: "fixture",
      fields: ["close"],
      minHistory: 1,
      required: true,
      source: "fixture",
    },
  ],
  scope: object.objectType,
  objectType: object.objectType,
  objectSubtype: object.objectSubtype,
  objectCode: object.objectCode,
  status: "neutral",
  direction: "neutral",
  value: 1,
  unit: "ratio",
  quality: "available",
  proxy: false,
  sampleCount: 320,
  asOf: "2026-11-25",
  computedAt,
  dataSources: ["fixture"],
  evidence: { components: [], notes: [], missingFields: [] },
  catalogVersion: "technical-signals-1.0.0",
  definitionHash: "a".repeat(64),
});

const read = (object: TechnicalPipelineObject): TechnicalObjectRead => ({
  identity: object,
  bars: [
    {
      time: "2026-11-25",
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: object.objectType === "gold" ? null : 1000,
      amount: object.objectType === "gold" ? null : 100000,
    },
  ],
  benchmark: null,
  priceBasis:
    object.objectType === "gold"
      ? "usd_per_ounce"
      : object.objectType === "market"
        ? "shanghai_composite"
        : object.objectType === "sector"
          ? "board_index"
          : "hfq",
  volumeApplicable: object.objectType !== "gold",
  dataSources: ["fixture"],
  quality: "available",
  asOf: "2026-11-25",
});

const confirmation = {
  available: true,
  advanceDeclineRatio: 0.6,
  breadthChange5: 0.02,
  leaderResonance: true,
  source: "fixture",
};

function dependencies(
  overrides: Partial<TechnicalPipelineDependencies> = {},
): TechnicalPipelineDependencies {
  return {
    now: () => new Date(computedAt),
    readObject: async (object) => read(object),
    readConfirmation: async () => confirmation,
    evaluateQuant: async ({ objects }) => ({
      catalogVersion: "technical-signals-1.0.0",
      computedAt,
      items: objects.map((input) => ({
        catalogVersion: "technical-signals-1.0.0",
        objectType: input.object_type,
        objectSubtype: input.object_subtype,
        objectCode: input.object_code,
        asOf: input.as_of ?? "2026-11-25",
        computedAt,
        inputHash: "b".repeat(64),
        technical: null,
        signals: [
          signal({
            objectType: input.object_type,
            objectSubtype: input.object_subtype,
            objectCode: input.object_code,
          }),
        ],
      })),
      errors: [],
    }),
    persist: async () => undefined,
    ...overrides,
  };
}

test("technical worker batches Quant calls at no more than two hundred objects", async () => {
  const batchSizes: number[] = [];
  const persisted: string[] = [];
  const metrics = await processTechnicalSignalBatches(
    Array.from({ length: 401 }, (_, index) => stockRef(index)),
    dependencies({
      evaluateQuant: async ({ objects }) => {
        batchSizes.push(objects.length);
        return {
          catalogVersion: "technical-signals-1.0.0",
          computedAt,
          items: objects.map((input) => ({
            catalogVersion: "technical-signals-1.0.0",
            objectType: input.object_type,
            objectSubtype: input.object_subtype,
            objectCode: input.object_code,
            asOf: "2026-11-25",
            computedAt,
            inputHash: "b".repeat(64),
            technical: null,
            signals: [
              signal({
                objectType: input.object_type,
                objectSubtype: input.object_subtype,
                objectCode: input.object_code,
              }),
            ],
          })),
          errors: [],
        };
      },
      persist: async (write) => {
        persisted.push(write.objectCode);
      },
    }),
  );
  assert.deepEqual(batchSizes, [200, 200, 1]);
  assert.equal(metrics.succeeded, 401);
  assert.equal(persisted.length, 401);
});

test("a failed batch is retried without rolling back successful batches", async () => {
  let firstBatchAttempts = 0;
  const persisted: string[] = [];
  const metrics = await processTechnicalSignalBatches(
    [...Array.from({ length: 200 }, (_, index) => stockRef(index)), stockRef(300)],
    dependencies({
      evaluateQuant: async ({ objects }) => {
        if (objects[0]?.object_code === "000000.SZ") {
          firstBatchAttempts += 1;
          if (firstBatchAttempts === 1) throw new Error("transient quant failure");
        }
        return {
          catalogVersion: "technical-signals-1.0.0",
          computedAt,
          items: objects.map((input) => ({
            catalogVersion: "technical-signals-1.0.0",
            objectType: input.object_type,
            objectSubtype: input.object_subtype,
            objectCode: input.object_code,
            asOf: "2026-11-25",
            computedAt,
            inputHash: "c".repeat(64),
            technical: null,
            signals: [
              signal({
                objectType: input.object_type,
                objectSubtype: input.object_subtype,
                objectCode: input.object_code,
              }),
            ],
          })),
          errors: [],
        };
      },
      persist: async (write) => {
        persisted.push(write.objectCode);
      },
    }),
  );
  assert.equal(firstBatchAttempts, 2);
  assert.equal(metrics.succeeded, 201);
  assert.equal(persisted.length, 201);
  assert.equal(metrics.failed, 0);
});

test("job orchestration runs market, gold, boards and stocks in dependency order", async () => {
  const order: string[] = [];
  await runTechnicalSignalJobs(
    dependencies({
      listMarket: async () => [
        { objectType: "market", objectSubtype: null, objectCode: "000001.SH" },
      ],
      listGold: async () => [{ objectType: "gold", objectSubtype: null, objectCode: "XAUUSD" }],
      listBoards: async () => [
        { objectType: "sector", objectSubtype: "industry", objectCode: "BK0475" },
        { objectType: "sector", objectSubtype: "concept", objectCode: "BK0816" },
      ],
      listStocks: async () => [stockRef(0)],
      persist: async (write) => {
        order.push(`${write.objectType}:${write.objectSubtype ?? ""}`);
      },
    }),
  );
  assert.deepEqual(order, ["market:", "gold:", "sector:industry", "sector:concept", "stock:"]);
});

test("cron graph places technical signals after their source domains", () => {
  const jobs = Object.fromEntries(CRON_JOBS.map((job) => [job.name, job]));
  assert.deepEqual(jobs["technical-signals-market"]?.dependsOn, [
    "kline-1d",
    "adj-factor",
    "market-asset-daily",
  ]);
  assert.deepEqual(jobs["technical-signals-boards"]?.dependsOn, [
    "boards",
    "board-kline",
    "constituents",
    "fundflow",
  ]);
  assert.deepEqual(jobs["technical-signals-stocks"]?.dependsOn, [
    "technical-signals-market",
    "technical-signals-boards",
  ]);
  assert.ok(jobs["technical-signals-stocks"]?.deadline === "21:30");
});
