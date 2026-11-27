import type { SignalLayer, SignalScope } from "./index.ts";

export const SIGNAL_RESULT_STATUSES = [
  "triggered",
  "neutral",
  "invalidated",
  "low-confidence",
  "unavailable",
  "not-applicable",
] as const;

export const SIGNAL_DIRECTIONS = ["bullish", "bearish", "neutral", "risk"] as const;

export const SIGNAL_QUALITIES = ["available", "low", "missing", "not-applicable"] as const;

export const OBJECT_SUBTYPES = ["industry", "concept"] as const;

export type SignalStatus = (typeof SIGNAL_RESULT_STATUSES)[number];
export type SignalDirection = (typeof SIGNAL_DIRECTIONS)[number];
export type SignalQuality = (typeof SIGNAL_QUALITIES)[number];
export type ObjectSubtype = (typeof OBJECT_SUBTYPES)[number];
export type SignalScopeName = SignalScope;
export type SignalLayerName = SignalLayer;

export interface SignalEvidenceComponent {
  signalId: string;
  status: SignalStatus;
  value: number | string | null;
}

export interface SignalEvidence {
  components: SignalEvidenceComponent[];
  notes: string[];
  missingFields: string[];
}

export interface SignalResult {
  signalId: string;
  displayName: string;
  rule: string;
  params: Record<string, unknown>;
  confirmation: string;
  invalidation: string;
  dataRequirements: Array<{
    dataset: string;
    fields: string[];
    minHistory: number;
    required: boolean;
    source: string;
  }>;
  scope: SignalScope;
  objectType: SignalScope;
  objectSubtype: ObjectSubtype | null;
  objectCode: string;
  status: SignalStatus;
  direction: SignalDirection;
  value: number | string | null;
  unit: string | null;
  quality: SignalQuality;
  proxy: boolean;
  sampleCount: number;
  asOf: string;
  computedAt: string;
  dataSources: string[];
  evidence: SignalEvidence;
  catalogVersion: string;
  definitionHash: string;
}

export type SignalStatusCounts = Record<SignalStatus, number>;

export const SIGNAL_JUDGMENT_VERSION = "signal-judgment-1.0.0" as const;

export const SIGNAL_JUDGMENT_VERDICTS = [
  "bullish",
  "bearish",
  "neutral",
  "mixed",
  "insufficient",
] as const;

export const SIGNAL_JUDGMENT_CONFIDENCES = ["high", "medium", "low", "insufficient"] as const;

export type SignalJudgmentVerdict = (typeof SIGNAL_JUDGMENT_VERDICTS)[number];
export type SignalJudgmentConfidence = (typeof SIGNAL_JUDGMENT_CONFIDENCES)[number];
export type SignalCoreLayer = Extract<SignalLayerName, "basic" | "pattern" | "advanced">;

export interface SignalJudgmentCounts {
  total: number;
  bullish: number;
  bearish: number;
  neutral: number;
  lowConfidence: number;
  unavailable: number;
  notApplicable: number;
  usable: number;
  coverage: number;
}

export interface SignalLayerJudgment {
  layer: SignalLayerName;
  label: string;
  verdict: SignalJudgmentVerdict;
  verdictLabel: string;
  rationale: string;
  confidence: SignalJudgmentConfidence;
  counts: SignalJudgmentCounts;
}

export interface SignalOverallJudgment {
  verdict: SignalJudgmentVerdict;
  verdictLabel: string;
  headline: string;
  rationale: string;
  confidence: SignalJudgmentConfidence;
  coreLayers: SignalCoreLayer[];
}

export interface TechnicalSignalJudgmentSummary {
  summaryVersion: typeof SIGNAL_JUDGMENT_VERSION;
  overall: SignalOverallJudgment;
  layers: SignalLayerJudgment[];
  counts: SignalStatusCounts;
  keySignals: string[];
  coverage: number;
}

export interface SignalSnapshot {
  objectType: SignalScope;
  objectSubtype: ObjectSubtype | null;
  objectCode: string;
  asOf: string;
  computedAt: string;
  catalogVersion: string;
  quality: Extract<SignalQuality, "available" | "low" | "missing">;
  counts: SignalStatusCounts;
  summarySignalIds: string[];
  signals: SignalResult[];
}

export class SignalContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalContractError";
  }
}

const fail = (path: string, message: string): never => {
  throw new SignalContractError(`${path}: ${message}`);
};

const asRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(path, "must be a non-empty string");
  }
  return value;
};

const asNullableString = (value: unknown, path: string): string | null => {
  if (value === null) return null;
  return asString(value, path);
};

const asStringArray = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value)) return fail(path, "must be an array");
  return value.map((item, index) => asString(item, `${path}[${index}]`));
};

const asUniqueStringArray = (value: unknown, path: string): string[] => {
  const items = asStringArray(value, path);
  if (new Set(items).size !== items.length) {
    return fail(path, "must not contain duplicates");
  }
  return items;
};

const asFiniteNumberOrNull = (value: unknown, path: string): number | null => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, "must be null or a finite number");
  }
  return value;
};

const asSignalValue = (value: unknown, path: string): number | string | null => {
  if (typeof value === "string" || value === null) return value;
  return asFiniteNumberOrNull(value, path);
};

const asBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== "boolean") return fail(path, "must be a boolean");
  return value;
};

const asNonNegativeInteger = (value: unknown, path: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return fail(path, "must be a non-negative integer");
  }
  return value;
};

const asScope = (value: unknown, path: string): SignalScope => {
  if (!["market", "sector", "stock", "gold"].includes(String(value))) {
    return fail(path, "must be market, sector, stock or gold");
  }
  return value as SignalScope;
};

const asStatus = (value: unknown, path: string): SignalStatus => {
  if (!SIGNAL_RESULT_STATUSES.includes(value as SignalStatus)) {
    return fail(
      path,
      `must be one of ${SIGNAL_RESULT_STATUSES.join(", ")}; received ${String(value)}`,
    );
  }
  return value as SignalStatus;
};

const asDirection = (value: unknown, path: string): SignalDirection => {
  if (!SIGNAL_DIRECTIONS.includes(value as SignalDirection)) {
    return fail(path, `must be one of ${SIGNAL_DIRECTIONS.join(", ")}`);
  }
  return value as SignalDirection;
};

const asQuality = (value: unknown, path: string): SignalQuality => {
  if (!SIGNAL_QUALITIES.includes(value as SignalQuality)) {
    return fail(path, `must be one of ${SIGNAL_QUALITIES.join(", ")}`);
  }
  return value as SignalQuality;
};

const asObjectSubtype = (
  scope: SignalScope,
  value: unknown,
  path: string,
): ObjectSubtype | null => {
  if (scope === "sector") {
    if (!OBJECT_SUBTYPES.includes(value as ObjectSubtype)) {
      return fail(path, "sector results require subtype industry or concept");
    }
    return value as ObjectSubtype;
  }
  if (value !== null) {
    return fail(path, "non-sector results require objectSubtype null");
  }
  return null;
};

const isIsoBusinessTime = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));

const isIsoTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

const asBusinessTime = (value: unknown, path: string): string => {
  const text = asString(value, path);
  if (!isIsoBusinessTime(text) && !isIsoTimestamp(text)) {
    return fail(path, "must be YYYY-MM-DD or an ISO 8601 UTC timestamp");
  }
  return text;
};

const asComputedTime = (value: unknown, path: string): string => {
  const text = asString(value, path);
  if (!isIsoTimestamp(text)) {
    return fail(path, "must be an ISO 8601 UTC timestamp");
  }
  return text;
};

const asSignalId = (value: unknown, path: string): string => {
  const text = asString(value, path);
  if (!/^(basic|pattern|advanced|micro)\.(market|sector|stock|gold)\.[a-z0-9_]+$/.test(text)) {
    return fail(path, "must use layer.scope.name format");
  }
  return text;
};

const asDefinitionHash = (value: unknown, path: string): string => {
  const text = asString(value, path);
  if (!/^[a-f0-9]{64}$/.test(text)) {
    return fail(path, "must be a lowercase SHA-256 hex digest");
  }
  return text;
};

const validateEvidence = (value: unknown, path: string): SignalEvidence => {
  const evidence = asRecord(value, path);
  if (!Array.isArray(evidence.components)) {
    return fail(`${path}.components`, "must be an array");
  }
  const components = evidence.components.map((item, index) => {
    const componentPath = `${path}.components[${index}]`;
    const component = asRecord(item, componentPath);
    return {
      signalId: asSignalId(component.signalId, `${componentPath}.signalId`),
      status: asStatus(component.status, `${componentPath}.status`),
      value: asSignalValue(component.value, `${componentPath}.value`),
    };
  });
  return {
    components,
    notes: asStringArray(evidence.notes, `${path}.notes`),
    missingFields: asUniqueStringArray(evidence.missingFields, `${path}.missingFields`),
  };
};

export const validateSignalResult = (input: unknown): SignalResult => {
  const path = "signalResult";
  const record = asRecord(input, path);
  const scope = asScope(record.scope, `${path}.scope`);
  const objectType = asScope(record.objectType, `${path}.objectType`);
  if (scope !== objectType) {
    return fail(`${path}.objectType`, "must match scope");
  }
  const value = asSignalValue(record.value, `${path}.value`);
  const params = asRecord(record.params, `${path}.params`);
  if (Object.keys(params).length === 0) {
    return fail(`${path}.params`, "must not be empty");
  }
  if (!Array.isArray(record.dataRequirements)) {
    return fail(`${path}.dataRequirements`, "must be an array");
  }
  const dataRequirements = record.dataRequirements.map((item, index) => {
    const requirementPath = `${path}.dataRequirements[${index}]`;
    const requirement = asRecord(item, requirementPath);
    return {
      dataset: asString(requirement.dataset, `${requirementPath}.dataset`),
      fields: asStringArray(requirement.fields, `${requirementPath}.fields`),
      minHistory: asNonNegativeInteger(requirement.minHistory, `${requirementPath}.minHistory`),
      required: asBoolean(requirement.required, `${requirementPath}.required`),
      source: asString(requirement.source, `${requirementPath}.source`),
    };
  });
  return {
    signalId: asSignalId(record.signalId, `${path}.signalId`),
    displayName: asString(record.displayName, `${path}.displayName`),
    rule: asString(record.rule, `${path}.rule`),
    params,
    confirmation: asString(record.confirmation, `${path}.confirmation`),
    invalidation: asString(record.invalidation, `${path}.invalidation`),
    dataRequirements,
    scope,
    objectType,
    objectSubtype: asObjectSubtype(scope, record.objectSubtype, `${path}.objectSubtype`),
    objectCode: asString(record.objectCode, `${path}.objectCode`),
    status: asStatus(record.status, `${path}.status`),
    direction: asDirection(record.direction, `${path}.direction`),
    value,
    unit: asNullableString(record.unit, `${path}.unit`),
    quality: asQuality(record.quality, `${path}.quality`),
    proxy: asBoolean(record.proxy, `${path}.proxy`),
    sampleCount: asNonNegativeInteger(record.sampleCount, `${path}.sampleCount`),
    asOf: asBusinessTime(record.asOf, `${path}.asOf`),
    computedAt: asComputedTime(record.computedAt, `${path}.computedAt`),
    dataSources: asUniqueStringArray(record.dataSources, `${path}.dataSources`),
    evidence: validateEvidence(record.evidence, `${path}.evidence`),
    catalogVersion: asString(record.catalogVersion, `${path}.catalogVersion`),
    definitionHash: asDefinitionHash(record.definitionHash, `${path}.definitionHash`),
  };
};

const validateCounts = (value: unknown, path: string): SignalStatusCounts => {
  const counts = asRecord(value, path);
  const expectedKeys = new Set<string>(SIGNAL_RESULT_STATUSES);
  for (const key of Object.keys(counts)) {
    if (!expectedKeys.has(key)) {
      return fail(`${path}.${key}`, "is not a signal status");
    }
  }
  return Object.fromEntries(
    SIGNAL_RESULT_STATUSES.map((status) => [
      status,
      asNonNegativeInteger(counts[status], `${path}.${status}`),
    ]),
  ) as SignalStatusCounts;
};

const asJudgmentVerdict = (value: unknown, path: string): SignalJudgmentVerdict => {
  if (!SIGNAL_JUDGMENT_VERDICTS.includes(value as SignalJudgmentVerdict)) {
    return fail(path, `must be one of ${SIGNAL_JUDGMENT_VERDICTS.join(", ")}`);
  }
  return value as SignalJudgmentVerdict;
};

const asJudgmentConfidence = (value: unknown, path: string): SignalJudgmentConfidence => {
  if (!SIGNAL_JUDGMENT_CONFIDENCES.includes(value as SignalJudgmentConfidence)) {
    return fail(path, `must be one of ${SIGNAL_JUDGMENT_CONFIDENCES.join(", ")}`);
  }
  return value as SignalJudgmentConfidence;
};

const asSignalLayer = (value: unknown, path: string): SignalLayerName => {
  if (!["basic", "pattern", "advanced", "micro"].includes(String(value))) {
    return fail(path, "must be basic, pattern, advanced or micro");
  }
  return value as SignalLayerName;
};

const asCoreLayer = (value: unknown, path: string): SignalCoreLayer => {
  const layer = asSignalLayer(value, path);
  if (layer === "micro") {
    return fail(path, "microstructure is auxiliary and cannot vote in the object total");
  }
  return layer;
};

const asCoverage = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return fail(path, "must be a finite number between 0 and 1");
  }
  return value;
};

const validateJudgmentCounts = (value: unknown, path: string): SignalJudgmentCounts => {
  const counts = asRecord(value, path);
  const total = asNonNegativeInteger(counts.total, `${path}.total`);
  const bullish = asNonNegativeInteger(counts.bullish, `${path}.bullish`);
  const bearish = asNonNegativeInteger(counts.bearish, `${path}.bearish`);
  const neutral = asNonNegativeInteger(counts.neutral, `${path}.neutral`);
  const lowConfidence = asNonNegativeInteger(counts.lowConfidence, `${path}.lowConfidence`);
  const unavailable = asNonNegativeInteger(counts.unavailable, `${path}.unavailable`);
  const notApplicable = asNonNegativeInteger(counts.notApplicable, `${path}.notApplicable`);
  const usable = asNonNegativeInteger(counts.usable, `${path}.usable`);
  const coverage = asCoverage(counts.coverage, `${path}.coverage`);
  const classified = bullish + bearish + neutral + lowConfidence + unavailable + notApplicable;
  if (classified !== total) {
    return fail(path, "direction and availability counts must sum to total");
  }
  if (usable !== bullish + bearish + neutral) {
    return fail(path, "usable must equal bullish + bearish + neutral");
  }
  const expectedCoverage = total === 0 ? 0 : usable / total;
  if (Math.abs(expectedCoverage - coverage) > 1e-9) {
    return fail(path, "coverage must equal usable / total");
  }
  return {
    total,
    bullish,
    bearish,
    neutral,
    lowConfidence,
    unavailable,
    notApplicable,
    usable,
    coverage,
  };
};

export const validateTechnicalSignalJudgmentSummary = (
  input: unknown,
): TechnicalSignalJudgmentSummary => {
  const path = "technicalSignalJudgmentSummary";
  const record = asRecord(input, path);
  const summaryVersion = asString(record.summaryVersion, `${path}.summaryVersion`);
  if (summaryVersion !== SIGNAL_JUDGMENT_VERSION) {
    return fail(
      `${path}.summaryVersion`,
      `must equal ${SIGNAL_JUDGMENT_VERSION}; received ${summaryVersion}`,
    );
  }

  const overallRecord = asRecord(record.overall, `${path}.overall`);
  const coreLayers = asStringArray(overallRecord.coreLayers, `${path}.overall.coreLayers`).map(
    (layer, index) => asCoreLayer(layer, `${path}.overall.coreLayers[${index}]`),
  );
  if (new Set(coreLayers).size !== coreLayers.length) {
    return fail(`${path}.overall.coreLayers`, "must not contain duplicates");
  }
  const overall: SignalOverallJudgment = {
    verdict: asJudgmentVerdict(overallRecord.verdict, `${path}.overall.verdict`),
    verdictLabel: asString(overallRecord.verdictLabel, `${path}.overall.verdictLabel`),
    headline: asString(overallRecord.headline, `${path}.overall.headline`),
    rationale: asString(overallRecord.rationale, `${path}.overall.rationale`),
    confidence: asJudgmentConfidence(overallRecord.confidence, `${path}.overall.confidence`),
    coreLayers,
  };

  if (!Array.isArray(record.layers)) {
    return fail(`${path}.layers`, "must be an array");
  }
  const layers = record.layers.map((item, index) => {
    const layerPath = `${path}.layers[${index}]`;
    const layerRecord = asRecord(item, layerPath);
    return {
      layer: asSignalLayer(layerRecord.layer, `${layerPath}.layer`),
      label: asString(layerRecord.label, `${layerPath}.label`),
      verdict: asJudgmentVerdict(layerRecord.verdict, `${layerPath}.verdict`),
      verdictLabel: asString(layerRecord.verdictLabel, `${layerPath}.verdictLabel`),
      rationale: asString(layerRecord.rationale, `${layerPath}.rationale`),
      confidence: asJudgmentConfidence(layerRecord.confidence, `${layerPath}.confidence`),
      counts: validateJudgmentCounts(layerRecord.counts, `${layerPath}.counts`),
    } satisfies SignalLayerJudgment;
  });
  if (new Set(layers.map((layer) => layer.layer)).size !== layers.length) {
    return fail(`${path}.layers`, "must not contain duplicate layers");
  }

  return {
    summaryVersion: SIGNAL_JUDGMENT_VERSION,
    overall,
    layers,
    counts: validateCounts(record.counts, `${path}.counts`),
    keySignals: asUniqueStringArray(record.keySignals, `${path}.keySignals`),
    coverage: asCoverage(record.coverage, `${path}.coverage`),
  };
};

const sameNullableSubtype = (left: ObjectSubtype | null, right: ObjectSubtype | null): boolean =>
  left === right;

export const validateSignalSnapshot = (input: unknown): SignalSnapshot => {
  const path = "signalSnapshot";
  const record = asRecord(input, path);
  const objectType = asScope(record.objectType, `${path}.objectType`);
  const objectSubtype = asObjectSubtype(objectType, record.objectSubtype, `${path}.objectSubtype`);
  if (!Array.isArray(record.signals)) {
    return fail(`${path}.signals`, "must be an array");
  }
  const signals = record.signals.map((signal) => validateSignalResult(signal));
  const signalIds = signals.map((signal) => signal.signalId);
  if (new Set(signalIds).size !== signalIds.length) {
    return fail(`${path}.signals`, "must not contain duplicate signal IDs");
  }

  const objectCode = asString(record.objectCode, `${path}.objectCode`);
  const asOf = asBusinessTime(record.asOf, `${path}.asOf`);
  const computedAt = asComputedTime(record.computedAt, `${path}.computedAt`);
  const catalogVersion = asString(record.catalogVersion, `${path}.catalogVersion`);
  for (const signal of signals) {
    if (
      signal.objectType !== objectType ||
      !sameNullableSubtype(signal.objectSubtype, objectSubtype) ||
      signal.objectCode !== objectCode ||
      signal.asOf !== asOf ||
      signal.catalogVersion !== catalogVersion
    ) {
      return fail(
        `${path}.signals`,
        `contains a result for a different object or catalog version: ${signal.signalId}`,
      );
    }
  }

  const counts = validateCounts(record.counts, `${path}.counts`);
  const actualCounts = Object.fromEntries(
    SIGNAL_RESULT_STATUSES.map((status) => [
      status,
      signals.filter((signal) => signal.status === status).length,
    ]),
  ) as SignalStatusCounts;
  if (SIGNAL_RESULT_STATUSES.some((status) => counts[status] !== actualCounts[status])) {
    return fail(`${path}.counts`, "must match the snapshot signals");
  }

  const summarySignalIds = asUniqueStringArray(record.summarySignalIds, `${path}.summarySignalIds`);
  const signalIdSet = new Set(signalIds);
  const unknownSummaryId = summarySignalIds.find((signalId) => !signalIdSet.has(signalId));
  if (unknownSummaryId) {
    return fail(
      `${path}.summarySignalIds`,
      `references a signal not present in the snapshot: ${unknownSummaryId}`,
    );
  }

  const quality = asQuality(record.quality, `${path}.quality`);
  if (!["available", "low", "missing"].includes(quality)) {
    return fail(`${path}.quality`, "must be available, low or missing");
  }

  return {
    objectType,
    objectSubtype,
    objectCode,
    asOf,
    computedAt,
    catalogVersion,
    quality: quality as SignalSnapshot["quality"],
    counts,
    summarySignalIds,
    signals,
  };
};
