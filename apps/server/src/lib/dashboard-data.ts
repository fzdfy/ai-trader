export interface BreadthCount {
  total: number;
  rising: number;
  falling: number;
  flat: number;
}

export interface LimitUpLadderItem {
  count: number;
  names: string[];
}

export interface LimitUpSummary {
  total: number;
  maxBoard: number;
  maxSealAmount: number;
  avgTurnover: number;
  openedCount: number;
  ladder: LimitUpLadderItem[];
}

export function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function summarizeBreadth(
  rows: Array<{ type: string; changePercent: string | null }>,
): Record<"industry" | "concept", BreadthCount> {
  const result: Record<"industry" | "concept", BreadthCount> = {
    industry: { total: 0, rising: 0, falling: 0, flat: 0 },
    concept: { total: 0, rising: 0, falling: 0, flat: 0 },
  };

  for (const row of rows) {
    if (row.type !== "industry" && row.type !== "concept") continue;
    const breadth = result[row.type];
    breadth.total += 1;
    const change = toNumber(row.changePercent);
    if (change == null || change === 0) breadth.flat += 1;
    else if (change > 0) breadth.rising += 1;
    else breadth.falling += 1;
  }

  return result;
}

export function summarizeLimitUp(
  rows: Array<{
    name: string;
    industry: string | null;
    limitUpCount: number;
    isLimitUp: boolean;
    openCount: number;
    sealAmount: string | number | null;
    turnoverRate: string | number | null;
  }>,
): LimitUpSummary {
  const sealed = rows.filter((row) => row.isLimitUp);
  const turnoverValues = rows
    .map((row) => toNumber(row.turnoverRate))
    .filter((value): value is number => value != null);
  const groups = new Map<number, string[]>();

  for (const row of sealed) {
    const names = groups.get(row.limitUpCount) ?? [];
    names.push(row.name);
    groups.set(row.limitUpCount, names);
  }

  return {
    total: sealed.length,
    maxBoard: sealed.reduce((max, row) => Math.max(max, row.limitUpCount), 0),
    maxSealAmount: sealed.reduce(
      (max, row) => Math.max(max, toNumber(row.sealAmount) ?? 0),
      0,
    ),
    avgTurnover:
      turnoverValues.length > 0
        ? turnoverValues.reduce((sum, value) => sum + value, 0) / turnoverValues.length
        : 0,
    openedCount: rows.filter((row) => row.openCount > 0).length,
    ladder: [...groups.entries()]
      .sort(([left], [right]) => right - left)
      .slice(0, 4)
      .map(([count, names]) => ({ count, names })),
  };
}

export function summarizeFundFlowBreadth(
  rows: Array<{ category: string; mainNetInflow: string | null }>,
) {
  const result = {
    industry: { total: 0, positive: 0 },
    concept: { total: 0, positive: 0 },
  };

  for (const row of rows) {
    if (row.category !== "industry" && row.category !== "concept") continue;
    result[row.category].total += 1;
    if ((toNumber(row.mainNetInflow) ?? 0) > 0) result[row.category].positive += 1;
  }

  return result;
}
