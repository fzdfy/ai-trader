import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { dataIncident } from "../../db/schema";
import { loadLatestQualityResults } from "./quality-runner";
import { QUALITY_RULES } from "./quality-rules";
import { getGovernanceAsset } from "./registry";
import type { DataTier, ResearchConsumer } from "./types";

export const RESEARCH_CONSUMER_ASSETS = {
  backtest: ["trading_calendar", "instrument", "bar1d_raw", "adj_factor"],
  screening: ["trading_calendar", "instrument", "bar1d_raw", "adj_factor"],
  stock_analysis: [
    "trading_calendar",
    "instrument",
    "quote_latest",
    "bar1d_raw",
    "adj_factor",
  ],
} as const satisfies Record<ResearchConsumer, readonly string[]>;

export type DataGovernanceGateMode = "off" | "warn" | "enforce";

type GateResult = {
  assetKey: string;
  ruleId?: string;
  tier: DataTier;
  status: "passed" | "warning" | "failed" | "error";
  severity: "warning" | "critical";
  checkedAt: string | Date;
};

type GateIncident = {
  assetKey: string | null;
  severity: string;
  status: string;
};

export type ResearchGateInput = {
  consumer: ResearchConsumer;
  results: readonly GateResult[];
  incidents: readonly GateIncident[];
  now: Date;
  mode?: DataGovernanceGateMode;
  evidenceSlaHours?: number;
};

export type ResearchGateWarning = {
  assetKey: string;
  tier: DataTier;
  status: GateResult["status"] | "missing";
  reason:
    | "missing_evidence"
    | "stale_evidence"
    | "critical_failure"
    | "unresolved_critical_incident"
    | "tier_1_degraded";
  checkedAt: string | null;
};

export type ResearchGateDecision = {
  allowed: boolean;
  mode: DataGovernanceGateMode;
  consumer: ResearchConsumer;
  requiredAssetKeys: string[];
  blockingAssetKeys: string[];
  warnings: ResearchGateWarning[];
  reasons: string[];
};

export class DataGovernanceGateError extends Error {
  readonly status = 409;
  readonly decision: ResearchGateDecision;

  constructor(decision: ResearchGateDecision) {
    super(
      `研究数据暂不可用：${decision.blockingAssetKeys.join("、")} 存在严重质量问题或证据过期。`,
    );
    this.name = "DataGovernanceGateError";
    this.decision = decision;
  }
}

function gateMode(value = process.env.DATA_GOVERNANCE_GATE_MODE): DataGovernanceGateMode {
  return value === "enforce" || value === "off" ? value : "warn";
}

export function buildResearchGateDecision(
  input: ResearchGateInput,
): ResearchGateDecision {
  const mode = input.mode ?? gateMode();
  const now = input.now.getTime();
  const evidenceSlaMs = (input.evidenceSlaHours ?? 36) * 3_600_000;
  const requiredAssetKeys = [...RESEARCH_CONSUMER_ASSETS[input.consumer]];
  const required = new Set<string>(requiredAssetKeys);
  const blocking = new Set<string>();
  const warnings: ResearchGateWarning[] = [];

  for (const assetKey of requiredAssetKeys) {
    const asset = getGovernanceAsset(assetKey);
    const tier = asset?.tier ?? "tier_1";
    const results = input.results.filter((result) => result.assetKey === assetKey);
    if (results.length === 0) {
      blocking.add(assetKey);
      warnings.push({
        assetKey,
        tier,
        status: "missing",
        reason: "missing_evidence",
        checkedAt: null,
      });
      continue;
    }
    const expectedRules = QUALITY_RULES.filter(
      (rule) => rule.assetKey === assetKey,
    );
    const presentRules = new Set(
      results.flatMap((result) => (result.ruleId ? [result.ruleId] : [])),
    );
    const missingRules = expectedRules
      .map((rule) => rule.id)
      .filter((ruleId) => !presentRules.has(ruleId));
    if (presentRules.size > 0 && missingRules.length > 0) {
      if (tier === "tier_0") blocking.add(assetKey);
      warnings.push({
        assetKey,
        tier,
        status: "missing",
        reason: "missing_evidence",
        checkedAt: null,
      });
      continue;
    }
    const checkedTimes = results.map((result) => new Date(result.checkedAt).getTime());
    const latest = Math.max(...checkedTimes.filter(Number.isFinite));
    if (!Number.isFinite(latest) || now - latest > evidenceSlaMs) {
      if (tier === "tier_0") blocking.add(assetKey);
      warnings.push({
        assetKey,
        tier,
        status: results[0]?.status ?? "error",
        reason: "stale_evidence",
        checkedAt: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
      });
      continue;
    }
    const critical = results.find(
      (result) =>
        result.severity === "critical" &&
        (result.status === "failed" || result.status === "error"),
    );
    if (critical) {
      if (tier === "tier_0") blocking.add(assetKey);
      warnings.push({
        assetKey,
        tier,
        status: critical.status,
        reason: "critical_failure",
        checkedAt: critical.checkedAt instanceof Date
          ? critical.checkedAt.toISOString()
          : critical.checkedAt,
      });
      continue;
    }
    const degraded = results.find(
      (result) => result.status === "warning" || result.status === "failed",
    );
    if (degraded && tier !== "tier_2") {
      warnings.push({
        assetKey,
        tier,
        status: degraded.status,
        reason: "tier_1_degraded",
        checkedAt: degraded.checkedAt instanceof Date
          ? degraded.checkedAt.toISOString()
          : degraded.checkedAt,
      });
    }
  }

  for (const incident of input.incidents) {
    if (
      !incident.assetKey ||
      !required.has(incident.assetKey) ||
      incident.severity !== "critical" ||
      !["open", "acknowledged", "resolving"].includes(incident.status)
    ) {
      continue;
    }
    const tier = getGovernanceAsset(incident.assetKey)?.tier ?? "tier_1";
    if (tier === "tier_0") blocking.add(incident.assetKey);
    warnings.push({
      assetKey: incident.assetKey,
      tier,
      status: "failed",
      reason: "unresolved_critical_incident",
      checkedAt: null,
    });
  }

  const blockingAssetKeys = [...blocking];
  return {
    allowed: mode !== "enforce" || blockingAssetKeys.length === 0,
    mode,
    consumer: input.consumer,
    requiredAssetKeys,
    blockingAssetKeys,
    warnings,
    reasons: warnings.map(
      (warning) => `${warning.assetKey}:${warning.reason}`,
    ),
  };
}

export async function assertResearchDataReady(
  consumer: ResearchConsumer,
): Promise<ResearchGateDecision> {
  const mode = gateMode();
  if (mode === "off") {
    return {
      allowed: true,
      mode,
      consumer,
      requiredAssetKeys: [...RESEARCH_CONSUMER_ASSETS[consumer]],
      blockingAssetKeys: [],
      warnings: [],
      reasons: [],
    };
  }
  const requiredAssetKeys = [...RESEARCH_CONSUMER_ASSETS[consumer]];
  const [results, incidents] = await Promise.all([
    loadLatestQualityResults(requiredAssetKeys),
    db
      .select({
        assetKey: dataIncident.assetKey,
        severity: dataIncident.severity,
        status: dataIncident.status,
      })
      .from(dataIncident)
      .where(
        and(
          inArray(dataIncident.assetKey, requiredAssetKeys),
          eq(dataIncident.incidentType, "quality"),
          eq(dataIncident.severity, "critical"),
          inArray(dataIncident.status, [
            "open",
            "acknowledged",
            "resolving",
          ]),
        ),
      ),
  ]);
  const decision = buildResearchGateDecision({
    consumer,
    mode,
    now: new Date(),
    results: results.map((result) => ({
      ...result,
      status: result.status as GateResult["status"],
      severity: result.severity as GateResult["severity"],
      tier: getGovernanceAsset(result.assetKey)?.tier ?? "tier_1",
    })),
    incidents,
  });
  if (!decision.allowed) throw new DataGovernanceGateError(decision);
  return decision;
}
