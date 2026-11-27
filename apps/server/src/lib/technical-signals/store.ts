import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { technicalSignalSnapshot, technicalSignalTrigger } from "../../db/schema";
import type {
  ObjectSubtype,
  SignalQuality,
  SignalResult,
  SignalStatus,
  TechnicalSignalJudgmentSummary,
} from "../../../../../packages/signal-catalog/src/contracts.ts";
import { validateTechnicalSignalJudgmentSummary } from "../../../../../packages/signal-catalog/src/contracts.ts";
import type { SignalLayer } from "../../../../../packages/signal-catalog/src/index.ts";

export interface SignalObjectIdentity {
  objectType: SignalResult["objectType"];
  objectSubtype: ObjectSubtype | null;
  objectCode: string;
}

export interface NormalizedSignalObjectIdentity {
  objectType: SignalResult["objectType"];
  objectSubtype: ObjectSubtype | "";
  objectCode: string;
}

export interface TechnicalSignalSnapshotWrite {
  objectType: SignalResult["objectType"];
  objectSubtype: ObjectSubtype | null;
  objectCode: string;
  asOf: string;
  catalogVersion: string;
  computedAt: Date;
  definitionHash: string;
  inputHash: string;
  quality: "available" | "low" | "missing";
  dataSources: string[];
  signals: SignalResult[];
  summary: TechnicalSignalJudgmentSummary;
}

export interface StoredTechnicalSignalSnapshot {
  objectType: SignalResult["objectType"];
  objectSubtype: ObjectSubtype | null;
  objectCode: string;
  asOf: string;
  catalogVersion: string;
  computedAt: Date;
  definitionHash: string;
  inputHash: string;
  quality: "available" | "low" | "missing";
  dataSources: string[];
  signals: SignalResult[];
  summary: TechnicalSignalJudgmentSummary | null;
}

export interface TechnicalSignalTriggerRow {
  objectType: SignalResult["objectType"];
  objectSubtype: ObjectSubtype | "";
  objectCode: string;
  asOf: string;
  catalogVersion: string;
  signalId: string;
  layer: SignalLayer;
  status: Exclude<SignalStatus, "neutral" | "not-applicable">;
  direction: SignalResult["direction"];
  valueNumeric: string | null;
  valueText: string | null;
  quality: SignalQuality;
  evidenceSummary: Record<string, unknown>;
  computedAt: Date;
}

export interface StoredTechnicalSignalSnapshotRow {
  objectType: string;
  objectSubtype: string;
  objectCode: string;
  asOf: string;
  catalogVersion: string;
  computedAt: Date;
  definitionHash: string;
  inputHash: string;
  quality: string;
  dataSourcesJson: string[];
  signalsJson: unknown;
  summaryJson: unknown;
}

export interface StockTechnicalSignalSummary {
  symbol: string;
  asOf: string;
  catalogVersion: string;
  quality: StoredTechnicalSignalSnapshot["quality"];
  counts: Record<SignalStatus, number>;
  keySignals: string[];
  error?: string;
}

const emptySignalCounts = (): Record<SignalStatus, number> => ({
  triggered: 0,
  neutral: 0,
  invalidated: 0,
  "low-confidence": 0,
  unavailable: 0,
  "not-applicable": 0,
});

const TRIGGER_STATUSES = new Set<SignalStatus>([
  "triggered",
  "invalidated",
  "low-confidence",
  "unavailable",
]);

export function normalizeSignalIdentity(
  identity: SignalObjectIdentity,
): NormalizedSignalObjectIdentity {
  if (identity.objectType === "sector") {
    if (identity.objectSubtype !== "industry" && identity.objectSubtype !== "concept") {
      throw new Error("sector signal identity requires industry or concept subtype");
    }
    return {
      objectType: identity.objectType,
      objectSubtype: identity.objectSubtype,
      objectCode: identity.objectCode,
    };
  }
  if (identity.objectSubtype !== null) {
    throw new Error("non-sector signal identity requires null subtype");
  }
  return {
    objectType: identity.objectType,
    objectSubtype: "",
    objectCode: identity.objectCode,
  };
}

export function snapshotStorageKey(
  write: Pick<
    TechnicalSignalSnapshotWrite,
    "objectType" | "objectSubtype" | "objectCode" | "asOf" | "catalogVersion"
  >,
): string {
  const identity = normalizeSignalIdentity(write);
  return [
    identity.objectType,
    identity.objectSubtype,
    identity.objectCode,
    write.asOf,
    write.catalogVersion,
  ].join("|");
}

export function dedupeSnapshotWrites(
  writes: TechnicalSignalSnapshotWrite[],
): TechnicalSignalSnapshotWrite[] {
  const byKey = new Map<string, TechnicalSignalSnapshotWrite>();
  for (const write of writes) {
    byKey.set(snapshotStorageKey(write), write);
  }
  return [...byKey.values()];
}

const layerFromSignalId = (signalId: string): SignalLayer => {
  const layer = signalId.split(".")[0];
  if (layer !== "basic" && layer !== "pattern" && layer !== "advanced" && layer !== "micro") {
    throw new Error(`invalid signal layer in ${signalId}`);
  }
  return layer;
};

export function buildTriggerRows(write: TechnicalSignalSnapshotWrite): TechnicalSignalTriggerRow[] {
  const identity = normalizeSignalIdentity(write);
  return write.signals
    .filter((signal) => TRIGGER_STATUSES.has(signal.status))
    .map((signal) => ({
      ...identity,
      asOf: write.asOf,
      catalogVersion: write.catalogVersion,
      signalId: signal.signalId,
      layer: layerFromSignalId(signal.signalId),
      status: signal.status as TechnicalSignalTriggerRow["status"],
      direction: signal.direction,
      valueNumeric:
        typeof signal.value === "number" && Number.isFinite(signal.value)
          ? String(signal.value)
          : null,
      valueText: typeof signal.value === "string" ? signal.value : null,
      quality: signal.quality,
      evidenceSummary: {
        notes: signal.evidence.notes,
        missingFields: signal.evidence.missingFields,
        proxy: signal.proxy,
      },
      computedAt: write.computedAt,
    }));
}

export async function upsertTechnicalSignalSnapshot(
  write: TechnicalSignalSnapshotWrite,
): Promise<string> {
  const identity = normalizeSignalIdentity(write);
  const triggers = buildTriggerRows(write);
  const key = snapshotStorageKey(write);
  await db.transaction(async (tx) => {
    await tx
      .insert(technicalSignalSnapshot)
      .values({
        ...identity,
        asOf: write.asOf,
        catalogVersion: write.catalogVersion,
        computedAt: write.computedAt,
        definitionHash: write.definitionHash,
        inputHash: write.inputHash,
        quality: write.quality,
        dataSourcesJson: write.dataSources,
        signalsJson: write.signals,
        summaryJson: write.summary,
      })
      .onConflictDoUpdate({
        target: [
          technicalSignalSnapshot.objectType,
          technicalSignalSnapshot.objectSubtype,
          technicalSignalSnapshot.objectCode,
          technicalSignalSnapshot.asOf,
          technicalSignalSnapshot.catalogVersion,
        ],
        set: {
          computedAt: write.computedAt,
          definitionHash: write.definitionHash,
          inputHash: write.inputHash,
          quality: write.quality,
          dataSourcesJson: write.dataSources,
          signalsJson: write.signals,
          summaryJson: write.summary,
        },
      });

    await tx
      .delete(technicalSignalTrigger)
      .where(
        and(
          eq(technicalSignalTrigger.objectType, identity.objectType),
          eq(technicalSignalTrigger.objectSubtype, identity.objectSubtype),
          eq(technicalSignalTrigger.objectCode, identity.objectCode),
          eq(technicalSignalTrigger.asOf, write.asOf),
          eq(technicalSignalTrigger.catalogVersion, write.catalogVersion),
        ),
      );
    if (triggers.length > 0) {
      await tx.insert(technicalSignalTrigger).values(triggers);
    }
  });
  return key;
}

export async function readTechnicalSignalSnapshot(
  identity: SignalObjectIdentity,
  options: { asOf?: string; catalogVersion?: string } = {},
): Promise<StoredTechnicalSignalSnapshot | null> {
  const normalized = normalizeSignalIdentity(identity);
  const [row] = await db
    .select()
    .from(technicalSignalSnapshot)
    .where(
      and(
        eq(technicalSignalSnapshot.objectType, normalized.objectType),
        eq(technicalSignalSnapshot.objectSubtype, normalized.objectSubtype),
        eq(technicalSignalSnapshot.objectCode, normalized.objectCode),
        options.asOf ? eq(technicalSignalSnapshot.asOf, options.asOf) : undefined,
        options.catalogVersion
          ? eq(technicalSignalSnapshot.catalogVersion, options.catalogVersion)
          : undefined,
      ),
    )
    .orderBy(desc(technicalSignalSnapshot.asOf), desc(technicalSignalSnapshot.computedAt))
    .limit(1);
  if (!row) return null;
  return mapStoredSnapshotRow(row);
}

export function mapStoredSnapshotRow(
  row: StoredTechnicalSignalSnapshotRow,
): StoredTechnicalSignalSnapshot {
  let summary: TechnicalSignalJudgmentSummary | null = null;
  try {
    summary = validateTechnicalSignalJudgmentSummary(row.summaryJson);
  } catch {
    summary = null;
  }
  return {
    objectType: row.objectType as StoredTechnicalSignalSnapshot["objectType"],
    objectSubtype: row.objectSubtype ? (row.objectSubtype as ObjectSubtype) : null,
    objectCode: row.objectCode,
    asOf: row.asOf,
    catalogVersion: row.catalogVersion,
    computedAt: row.computedAt,
    definitionHash: row.definitionHash,
    inputHash: row.inputHash,
    quality: row.quality as StoredTechnicalSignalSnapshot["quality"],
    dataSources: row.dataSourcesJson,
    signals: row.signalsJson as SignalResult[],
    summary,
  };
}

export function toStockTechnicalSignalSummary(
  snapshot: StoredTechnicalSignalSnapshot,
): StockTechnicalSignalSummary {
  const counts = Object.fromEntries(
    ["triggered", "neutral", "invalidated", "low-confidence", "unavailable", "not-applicable"].map(
      (status) => [status, snapshot.signals.filter((signal) => signal.status === status).length],
    ),
  ) as Record<SignalStatus, number>;
  return {
    symbol: snapshot.objectCode,
    asOf: snapshot.asOf,
    catalogVersion: snapshot.catalogVersion,
    quality: snapshot.quality,
    counts,
    keySignals: snapshot.signals
      .filter(
        (signal) =>
          signal.status === "triggered" ||
          signal.status === "invalidated" ||
          signal.status === "low-confidence",
      )
      .slice(0, 4)
      .map((signal) => signal.signalId),
  };
}

export async function readStockTechnicalSignalSummaries(
  symbols: readonly string[],
): Promise<StockTechnicalSignalSummary[]> {
  const results = await Promise.allSettled(
    symbols.map((symbol) =>
      readTechnicalSignalSnapshot({
        objectType: "stock",
        objectSubtype: null,
        objectCode: symbol,
      }),
    ),
  );
  return results.map((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      return toStockTechnicalSignalSummary(result.value);
    }
    return {
      symbol: symbols[index]!,
      asOf: "",
      catalogVersion: "",
      quality: "missing" as const,
      counts: emptySignalCounts(),
      keySignals: [],
      error:
        result.status === "rejected"
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : "技术信号快照不存在",
    };
  });
}

export async function readSectorTechnicalSignalSummaries(
  codes: readonly string[],
  subtype: ObjectSubtype,
): Promise<StockTechnicalSignalSummary[]> {
  const results = await Promise.allSettled(
    codes.map((code) =>
      readTechnicalSignalSnapshot({
        objectType: "sector",
        objectSubtype: subtype,
        objectCode: code,
      }),
    ),
  );
  return results.map((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      return toStockTechnicalSignalSummary(result.value);
    }
    return {
      symbol: codes[index]!,
      asOf: "",
      catalogVersion: "",
      quality: "missing" as const,
      counts: emptySignalCounts(),
      keySignals: [],
      error:
        result.status === "rejected"
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : "技术信号快照不存在",
    };
  });
}
