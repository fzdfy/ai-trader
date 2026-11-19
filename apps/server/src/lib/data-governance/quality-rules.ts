export type QualityDimension =
  | "freshness"
  | "completeness"
  | "uniqueness"
  | "validity"
  | "coverage"
  | "consistency"
  | "pit";

export type QualityRuleDefinition = {
  id: string;
  version: number;
  assetKey: string;
  dimension: QualityDimension;
  severity: "warning" | "critical";
  triggerJobTypes: string[];
  checkKey:
    | "freshness.business_time"
    | "completeness.required_columns"
    | "uniqueness.primary_key"
    | "validity.ohlcv"
    | "coverage.active_symbols"
    | "consistency.calendar_alignment"
    | "pit.as_of_known_at";
  params: Record<string, unknown>;
};

function rule(
  assetKey: string,
  id: string,
  dimension: QualityDimension,
  checkKey: QualityRuleDefinition["checkKey"],
  triggerJobTypes: string[],
  severity: QualityRuleDefinition["severity"],
  params: Record<string, unknown> = {},
): QualityRuleDefinition {
  return {
    id: `${id}.${assetKey}`,
    version: 1,
    assetKey,
    dimension,
    severity,
    triggerJobTypes,
    checkKey,
    params,
  };
}

export const QUALITY_RULES: readonly QualityRuleDefinition[] = [
  rule("bar1d_raw", "freshness.business_time", "freshness", "freshness.business_time", ["kline-1d"], "warning", {
    staleAfterHours: 96,
  }),
  rule("bar1d_raw", "completeness.required_columns", "completeness", "completeness.required_columns", ["kline-1d"], "critical"),
  rule("bar1d_raw", "uniqueness.primary_key", "uniqueness", "uniqueness.primary_key", ["kline-1d"], "critical"),
  rule("bar1d_raw", "validity.ohlcv", "validity", "validity.ohlcv", ["kline-1d", "kline-1d-backfill"], "critical"),
  rule("bar1d_raw", "coverage.active_symbols", "coverage", "coverage.active_symbols", ["kline-1d"], "warning", {
    minimumRatio: 0.98,
  }),
  rule("bar1d_raw", "consistency.calendar_alignment", "consistency", "consistency.calendar_alignment", ["kline-1d", "calendar"], "critical"),
  rule("bar1d_raw", "pit.as_of_known_at", "pit", "pit.as_of_known_at", ["kline-1d"], "critical"),
  rule("bar1d_hfq", "freshness.business_time", "freshness", "freshness.business_time", ["kline-1d", "adj-factor"], "critical", {
    staleAfterHours: 96,
  }),
  rule("bar1d_hfq", "validity.ohlcv", "validity", "validity.ohlcv", ["kline-1d", "adj-factor"], "critical"),
  rule("adj_factor", "freshness.business_time", "freshness", "freshness.business_time", ["adj-factor"], "critical", {
    staleAfterHours: 96,
  }),
  rule("adj_factor", "pit.as_of_known_at", "pit", "pit.as_of_known_at", ["adj-factor"], "critical"),
  rule("adj_factor_latest", "pit.as_of_known_at", "pit", "pit.as_of_known_at", ["adj-factor"], "critical"),
  rule("instrument", "completeness.required_columns", "completeness", "completeness.required_columns", ["instruments"], "critical"),
  rule("trading_calendar", "freshness.business_time", "freshness", "freshness.business_time", ["calendar"], "critical", {
    staleAfterHours: 24 * 14,
  }),
  rule("trading_calendar", "uniqueness.primary_key", "uniqueness", "uniqueness.primary_key", ["calendar"], "critical"),
] as const;

export function getQualityRulesForAssets(
  assetKeys: readonly string[],
  triggerJobType?: string,
): QualityRuleDefinition[] {
  const assets = new Set(assetKeys);
  return QUALITY_RULES.filter(
    (item) =>
      assets.has(item.assetKey) &&
      (!triggerJobType || item.triggerJobTypes.includes(triggerJobType)),
  );
}
