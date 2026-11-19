import type { GovernanceAsset } from "./types.ts";

const TIERS = new Set(["tier_0", "tier_1", "tier_2"]);
const DOMAINS = new Set([
  "reference",
  "market_raw",
  "market_intelligence",
  "research_derived",
  "application",
]);
const KINDS = new Set(["reference", "raw", "snapshot", "derived", "application"]);
const CLASSIFICATIONS = new Set(["internal", "restricted"]);
const RETENTION_MODES = new Set(["permanent", "duration", "rebuildable"]);
const CONSUMERS = new Set(["backtest", "screening", "stock_analysis"]);

function validateLineage(asset: GovernanceAsset, errors: string[]) {
  const lineage = asset.lineage;
  for (const target of lineage.upstreamAssets) {
    if (target === asset.key) errors.push(`${asset.key}: self-reference lineage`);
  }
  for (const target of lineage.downstreamAssets) {
    if (target === asset.key) errors.push(`${asset.key}: self-reference lineage`);
  }
  const combined = [...lineage.upstreamAssets, ...lineage.downstreamAssets];
  if (new Set(combined).size !== combined.length) {
    errors.push(`${asset.key}: duplicate lineage target`);
  }
  if (lineage.jobTypes.some((jobType) => !jobType.trim())) {
    errors.push(`${asset.key}: empty lineage job type`);
  }
}

export function validateGovernanceAsset(asset: GovernanceAsset): string[] {
  const errors: string[] = [];
  if (!asset.key.trim()) errors.push("asset key is required");
  if (!asset.name.trim()) errors.push(`${asset.key}: name is required`);
  if (!KINDS.has(asset.kind)) errors.push(`${asset.key}: invalid asset kind`);
  if (!DOMAINS.has(asset.domain)) errors.push(`${asset.key}: invalid data domain`);
  if (!TIERS.has(asset.tier)) errors.push(`${asset.key}: invalid data tier`);
  if (!CLASSIFICATIONS.has(asset.classification)) {
    errors.push(`${asset.key}: invalid classification`);
  }

  const responsibilities = asset.responsibilities;
  if (!responsibilities.owner?.name.trim()) errors.push(`${asset.key}: owner is required`);
  if (!responsibilities.steward?.name.trim()) errors.push(`${asset.key}: steward is required`);
  if (!responsibilities.operator?.name.trim()) errors.push(`${asset.key}: operator is required`);

  if (!RETENTION_MODES.has(asset.retention.mode)) {
    errors.push(`${asset.key}: invalid retention mode`);
  }
  if (
    asset.retention.mode === "duration" &&
    (!Number.isFinite(asset.retention.durationDays) ||
      (asset.retention.durationDays ?? 0) <= 0)
  ) {
    errors.push(`${asset.key}: durationDays must be positive`);
  }
  if (!asset.retention.note.trim()) errors.push(`${asset.key}: retention note is required`);

  const contract = asset.contract;
  if (!contract.businessDefinition.trim()) {
    errors.push(`${asset.key}: business definition is required`);
  }
  if (!contract.grain.trim()) errors.push(`${asset.key}: grain is required`);
  if (!contract.eventTimeField.trim()) errors.push(`${asset.key}: event time field is required`);
  if (
    !Number.isFinite(contract.freshnessSlaHours) ||
    contract.freshnessSlaHours <= 0
  ) {
    errors.push(`${asset.key}: freshness SLA must be positive`);
  }
  if (contract.allowedConsumers.some((consumer) => !CONSUMERS.has(consumer))) {
    errors.push(`${asset.key}: invalid allowed consumer`);
  }
  if (asset.tier === "tier_0") {
    if (!contract.primaryKey.length) errors.push(`${asset.key}: Tier 0 primary key is required`);
    if (!contract.allowedConsumers.length) {
      errors.push(`${asset.key}: Tier 0 allowed consumers are required`);
    }
  }

  validateLineage(asset, errors);
  return errors;
}

export function validateGovernanceRegistry(
  assets: readonly GovernanceAsset[],
): string[] {
  const errors = assets.flatMap(validateGovernanceAsset);
  const seen = new Set<string>();
  for (const asset of assets) {
    if (seen.has(asset.key)) errors.push(`${asset.key}: duplicate asset key`);
    seen.add(asset.key);
  }
  return errors;
}
