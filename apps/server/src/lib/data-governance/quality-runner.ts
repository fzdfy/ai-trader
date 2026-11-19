import { asc, desc, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  dataQualityResult,
} from "../../db/schema";
import { openOrUpdateQualityIncident } from "./incidents";
import { executeQualityRule } from "./quality-checks";
import {
  getQualityRulesForAssets,
  type QualityRuleDefinition,
} from "./quality-rules";
import { getGovernanceAsset } from "./registry";
import type { GovernanceAsset } from "./types";

export type QualityExecutionContext = {
  asset: GovernanceAsset;
  now: Date;
  jobRunId: number | null;
  requestId: string | null;
};

export type QualityCheckResult = {
  ruleId: string;
  status: "passed" | "warning" | "failed" | "error";
  severity: "warning" | "critical";
  observedValue: number | null;
  details: Record<string, unknown>;
};

export type QualityRuleExecutor = (
  rule: QualityRuleDefinition,
  context: QualityExecutionContext,
) => Promise<QualityCheckResult>;

export type RunQualityChecksInput = {
  assetKeys: string[];
  rules?: readonly QualityRuleDefinition[];
  jobRunId?: number | null;
  requestId?: string | null;
  now?: Date;
  triggerJobType?: string;
};

export type QualityRunSummary = {
  results: Array<QualityCheckResult & { assetKey: string }>;
  incidentIds: number[];
};

type DataQualityResult = typeof dataQualityResult.$inferSelect;

function syntheticAsset(rule: QualityRuleDefinition): GovernanceAsset {
  return {
    key: rule.assetKey,
    name: rule.assetKey,
    kind: "raw",
    domain: "market_raw",
    tier: "tier_0",
    responsibilities: {
      owner: { name: "Test" },
      steward: { name: "Test" },
      operator: { name: "Test" },
    },
    classification: "internal",
    retention: { mode: "rebuildable", note: "test fixture" },
    contract: {
      businessDefinition: "test fixture",
      grain: "fixture",
      primaryKey: [],
      eventTimeField: "time",
      freshnessSlaHours: 96,
      allowedConsumers: [],
    },
    sourceStandardRefs: [],
    lineage: { upstreamAssets: [], downstreamAssets: [], jobTypes: [] },
  };
}

export async function runQualityChecks(
  input: RunQualityChecksInput,
  execute: QualityRuleExecutor = executeQualityRule,
): Promise<QualityRunSummary> {
  const assetKeys = [...new Set(input.assetKeys)];
  const rules = (
    input.rules
      ? input.rules.filter((rule) => assetKeys.includes(rule.assetKey))
      : getQualityRulesForAssets(assetKeys, input.triggerJobType)
  ).filter(
    (rule, index, values) =>
      values.findIndex(
        (candidate) =>
          candidate.id === rule.id && candidate.assetKey === rule.assetKey,
      ) === index,
  );
  const now = input.now ?? new Date();
  const results: QualityRunSummary["results"] = [];

  for (const rule of rules) {
    const asset = getGovernanceAsset(rule.assetKey) ?? syntheticAsset(rule);
    let checked: QualityCheckResult;
    try {
      checked = await execute(rule, {
        asset,
        now,
        jobRunId: input.jobRunId ?? null,
        requestId: input.requestId ?? null,
      });
    } catch (error) {
      checked = {
        ruleId: rule.id,
        status: "error",
        severity: rule.severity,
        observedValue: null,
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    results.push({ ...checked, assetKey: rule.assetKey });
  }

  if (results.length > 0) {
    await db.insert(dataQualityResult).values(
      results.map((checked) => ({
        assetKey: checked.assetKey,
        ruleId: checked.ruleId,
        ruleVersion:
          rules.find(
            (rule) =>
              rule.id === checked.ruleId &&
              rule.assetKey === checked.assetKey,
          )?.version ?? 1,
        status: checked.status,
        severity: checked.severity,
        jobRunId: input.jobRunId ?? null,
        requestId: input.requestId ?? null,
        observedValue:
          checked.observedValue == null ? null : String(checked.observedValue),
        detailsJson: checked.details,
        checkedAt: now,
      })),
    );
  }

  const incidentIds: number[] = [];
  for (const assetKey of assetKeys) {
    const critical = results.filter(
      (checked) =>
        checked.assetKey === assetKey &&
        checked.severity === "critical" &&
        (checked.status === "failed" || checked.status === "error"),
    );
    if (critical.length === 0) continue;
    incidentIds.push(
      await openOrUpdateQualityIncident({
        assetKey,
        title: `${assetKey} 数据质量严重异常`,
        description: critical.map((checked) => checked.ruleId).join(", "),
        payloadJson: {
          rules: critical.map((checked) => ({
            ruleId: checked.ruleId,
            status: checked.status,
            observedValue: checked.observedValue,
          })),
          jobRunId: input.jobRunId ?? null,
          requestId: input.requestId ?? null,
        },
      }),
    );
  }

  return { results, incidentIds };
}

export async function loadLatestQualityResults(
  assetKeys: readonly string[],
): Promise<DataQualityResult[]> {
  if (assetKeys.length === 0) return [];
  return db
    .selectDistinctOn(
      [dataQualityResult.assetKey, dataQualityResult.ruleId],
      {
        id: dataQualityResult.id,
        assetKey: dataQualityResult.assetKey,
        ruleId: dataQualityResult.ruleId,
        ruleVersion: dataQualityResult.ruleVersion,
        status: dataQualityResult.status,
        severity: dataQualityResult.severity,
        jobRunId: dataQualityResult.jobRunId,
        requestId: dataQualityResult.requestId,
        observedValue: dataQualityResult.observedValue,
        detailsJson: dataQualityResult.detailsJson,
        checkedAt: dataQualityResult.checkedAt,
      },
    )
    .from(dataQualityResult)
    .where(inArray(dataQualityResult.assetKey, [...assetKeys]))
    .orderBy(
      asc(dataQualityResult.assetKey),
      asc(dataQualityResult.ruleId),
      desc(dataQualityResult.checkedAt),
      desc(dataQualityResult.id),
    );
}
