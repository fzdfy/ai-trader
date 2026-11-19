export type DataDomain =
  | "reference"
  | "market_raw"
  | "market_intelligence"
  | "research_derived"
  | "application";

export type DataTier = "tier_0" | "tier_1" | "tier_2";

export type ResearchConsumer = "backtest" | "screening" | "stock_analysis";

export type Responsibility = {
  name: string;
  role?: string;
  contact?: string;
};

export type RetentionPolicy = {
  mode: "permanent" | "duration" | "rebuildable";
  durationDays?: number;
  note: string;
};

export type DataContract = {
  businessDefinition: string;
  grain: string;
  primaryKey: string[];
  eventTimeField: string;
  knownAtField?: string;
  freshnessSlaHours: number;
  allowedConsumers: ResearchConsumer[];
};

export type DataLineage = {
  upstreamAssets: string[];
  downstreamAssets: string[];
  jobTypes: string[];
};

export type GovernanceAsset = {
  key: string;
  name: string;
  kind: "reference" | "raw" | "snapshot" | "derived" | "application";
  domain: DataDomain;
  tier: DataTier;
  responsibilities: {
    owner: Responsibility;
    steward: Responsibility;
    operator: Responsibility;
  };
  classification: "internal" | "restricted";
  retention: RetentionPolicy;
  contract: DataContract;
  sourceStandardRefs: string[];
  lineage: DataLineage;
};
