type MarketSectionStatus = "available" | "low" | "missing" | "error";

interface BreadthCount {
  total: number;
  rising: number;
  falling: number;
  flat: number;
}

interface FundFlowItem {
  code: string;
  name: string;
  mainNetInflow: number | null;
}

export interface OverviewDashboardSource {
  asOf: {
    boards: string | null;
    fundFlow: string | null;
    limitUp: string | null;
  };
  breadth: {
    industry: BreadthCount;
    concept: BreadthCount;
  };
  fundFlow: {
    industry: FundFlowItem[];
    concept: FundFlowItem[];
  };
  limitUp: {
    total: number;
    maxBoard: number;
    maxSealAmount: number;
    avgTurnover: number;
    openedCount: number;
    ladder: Array<{ count: number; names: string[] }>;
    leaders: Array<{ name: string; industry: string | null; count: number }>;
  };
}

export interface OverviewAnomaly {
  ruleId: string;
  title: string;
  evidence: string;
  category: "industry" | "concept" | "limit_up";
  asOf: string;
  href: string;
}

function money(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "暂无";
  const amount = Math.abs(value) / 100_000_000;
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${amount.toFixed(1)} 亿`;
}

function fundAnomaly(
  item: FundFlowItem | undefined,
  category: "industry" | "concept",
  direction: "top" | "bottom",
  asOf: string,
): OverviewAnomaly[] {
  if (!item || item.mainNetInflow == null) return [];
  if (direction === "top" && item.mainNetInflow <= 0) return [];
  if (direction === "bottom" && item.mainNetInflow >= 0) return [];
  return [{
    ruleId: `${category}-${direction}-main-net-inflow`,
    title: `${item.name}${direction === "top" ? "主力流入居前" : "主力流出居前"}`,
    evidence: `${direction === "top" ? "主力净流入" : "主力净流出"} ${money(
      direction === "top" ? item.mainNetInflow : Math.abs(item.mainNetInflow),
    )}`,
    category,
    asOf,
    href: `/home/market/boards/${encodeURIComponent(item.code)}?type=${category}`,
  }];
}

export function buildOverviewSections(source: OverviewDashboardSource): {
  breadth: {
    status: MarketSectionStatus;
    industry: BreadthCount;
    concept: BreadthCount;
    asOf: string | null;
  };
  limitUp: OverviewDashboardSource["limitUp"] & {
    status: MarketSectionStatus;
    asOf: string | null;
  };
  anomalies: {
    status: MarketSectionStatus;
    items: OverviewAnomaly[];
    asOf: string | null;
  };
} {
  const industryRows = [...source.fundFlow.industry].sort(
    (left, right) => (right.mainNetInflow ?? Number.NEGATIVE_INFINITY) -
      (left.mainNetInflow ?? Number.NEGATIVE_INFINITY),
  );
  const conceptRows = [...source.fundFlow.concept].sort(
    (left, right) => (right.mainNetInflow ?? Number.NEGATIVE_INFINITY) -
      (left.mainNetInflow ?? Number.NEGATIVE_INFINITY),
  );
  const industryByName = new Map(
    source.fundFlow.industry.map((item) => [item.name, item]),
  );
  const limitUpIndustries = [...source.limitUp.leaders.reduce((groups, leader) => {
    if (!leader.industry) return groups;
    groups.set(leader.industry, (groups.get(leader.industry) ?? 0) + leader.count);
    return groups;
  }, new Map<string, number>()).entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([industry, count]): OverviewAnomaly => {
      const item = industryByName.get(industry);
      return {
        ruleId: "limit-up-industry-concentration",
        title: `${industry}涨停集中`,
        evidence: `涨停池命中 ${count} 次`,
        category: "limit_up",
        asOf: source.asOf.limitUp ?? source.asOf.boards ?? "",
        href: item
          ? `/home/market/boards/${encodeURIComponent(item.code)}?type=industry`
          : "/home/market/boards?type=industry",
      };
    });
  const fundAsOf = source.asOf.fundFlow ?? source.asOf.boards ?? "";
  const items = [
    ...fundAnomaly(industryRows[0], "industry", "top", fundAsOf),
    ...fundAnomaly(industryRows.at(-1), "industry", "bottom", fundAsOf),
    ...fundAnomaly(conceptRows[0], "concept", "top", fundAsOf),
    ...fundAnomaly(conceptRows.at(-1), "concept", "bottom", fundAsOf),
    ...limitUpIndustries,
  ];
  const breadthTotal = source.breadth.industry.total + source.breadth.concept.total;
  return {
    breadth: {
      status: breadthTotal > 0 ? "available" : "missing",
      ...source.breadth,
      asOf: source.asOf.boards,
    },
    limitUp: {
      ...source.limitUp,
      status: source.limitUp.total > 0 ? "available" : "missing",
      asOf: source.asOf.limitUp,
    },
    anomalies: {
      status: items.length > 0 ? "available" : "missing",
      items,
      asOf: source.asOf.fundFlow ?? source.asOf.boards,
    },
  };
}
