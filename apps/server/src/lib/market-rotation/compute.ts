export type RotationWindow = "5D" | "20D" | "60D";

export interface RotationPoint {
  date: string;
  value: number;
}

export interface RotationSeries {
  code: string;
  name: string;
  points: RotationPoint[];
}

export interface RotationRow {
  code: string;
  name: string;
  relativeReturn: number | null;
  rank: number | null;
  rankChange: number | null;
  moneyConfirmation: number | null;
  limitUpConcentration: number | null;
  phase: "加速" | "扩散" | "放缓" | "修复" | "退潮" | "稳定" | "数据不足";
  quality: "available" | "low" | "missing";
}

export interface GrowthDefenseResult {
  value: number;
  state: "低区" | "中间区" | "高区";
  percentile1500d: number | null;
  relativeReturn20d: number | null;
  thresholdLow: 0.16;
  thresholdHigh: 0.28;
  asOf: string | null;
  quality: "available" | "low" | "missing";
}

const WINDOW_SIZE: Record<RotationWindow, number> = {
  "5D": 5,
  "20D": 20,
  "60D": 60,
};

function change(points: RotationPoint[], endIndex: number, size: number): number | null {
  const startIndex = endIndex - size;
  if (startIndex < 0) return null;
  const start = points[startIndex]?.value;
  const end = points[endIndex]?.value;
  if (start == null || end == null || start === 0) return null;
  return ((end / start) - 1) * 100;
}

export function computeRotationRanking(
  series: RotationSeries[],
  window: RotationWindow,
  fundingByCode: ReadonlyMap<string, number> = new Map(),
  limitUpByCode: ReadonlyMap<string, number> = new Map(),
): RotationRow[] {
  const size = WINDOW_SIZE[window];
  const prepared = series.map((item) => {
    const endIndex = item.points.length - 1;
    return {
      ...item,
      currentReturn: change(item.points, endIndex, size),
      previousReturn: change(item.points, endIndex - size, size),
    };
  });
  const ranked = [...prepared]
    .filter((item) => item.currentReturn != null)
    .sort((left, right) => (right.currentReturn ?? 0) - (left.currentReturn ?? 0));
  const previousRank = new Map(
    [...prepared]
      .filter((item) => item.previousReturn != null)
      .sort((left, right) => (right.previousReturn ?? 0) - (left.previousReturn ?? 0))
      .map((item, index) => [item.code, index + 1]),
  );
  const total = ranked.length;
  return prepared.map((item) => {
    const rank = ranked.findIndex((row) => row.code === item.code) + 1 || null;
    const prior = previousRank.get(item.code) ?? null;
    const rankChange = rank != null && prior != null ? prior - rank : null;
    const percentile = rank == null || total === 0 ? null : rank / total;
    let phase: RotationRow["phase"] = "数据不足";
    if (item.currentReturn == null || rank == null || percentile == null) {
      phase = "数据不足";
    } else if (rank <= Math.max(1, Math.ceil(total * 0.25)) && item.currentReturn > 0) {
      phase = "加速";
    } else if (rank <= Math.max(1, Math.ceil(total * 0.5)) && item.currentReturn > 0) {
      phase = "扩散";
    } else if (rank > total - Math.max(1, Math.ceil(total * 0.25)) && item.currentReturn < 0) {
      phase = "退潮";
    } else if (percentile > 0.5 && (rankChange ?? 0) > 0) {
      phase = "修复";
    } else if (percentile <= 0.5 && (rankChange ?? 0) < 0) {
      phase = "放缓";
    } else {
      phase = "稳定";
    }
    const quality: RotationRow["quality"] =
      item.currentReturn == null
        ? "missing"
        : rankChange == null
          ? "low"
          : "available";
    return {
      code: item.code,
      name: item.name,
      relativeReturn: item.currentReturn,
      rank,
      rankChange,
      moneyConfirmation: fundingByCode.get(item.code) ?? null,
      limitUpConcentration: limitUpByCode.get(item.code) ?? null,
      phase,
      quality,
    };
  }).sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));
}

export function computeGrowthDefense(
  growth: RotationSeries,
  defense: RotationSeries,
): GrowthDefenseResult {
  const growthByDate = new Map(growth.points.map((point) => [point.date, point.value]));
  const common = defense.points
    .filter((point) => growthByDate.has(point.date))
    .map((point) => ({
      date: point.date,
      growth: growthByDate.get(point.date)!,
      defense: point.value,
    }));
  if (common.length === 0) {
    return {
      value: 0,
      state: "中间区",
      percentile1500d: null,
      relativeReturn20d: null,
      thresholdLow: 0.16,
      thresholdHigh: 0.28,
      asOf: null,
      quality: "missing",
    };
  }
  const ratios = common
    .map((point) => point.growth / point.defense)
    .filter((value) => Number.isFinite(value) && value > 0);
  const value = ratios.at(-1) ?? 0;
  const sorted = [...ratios].sort((left, right) => left - right);
  const percentile = sorted.length === 0
    ? null
    : sorted.filter((item) => item <= value).length / sorted.length;
  const current = common.at(-1)!;
  const before20 = common.at(-21);
  const relativeReturn20d =
    before20 == null
      ? null
      : (((current.growth / before20.growth) / (current.defense / before20.defense)) - 1) * 100;
  return {
    value,
    state: value < 0.16 ? "低区" : value >= 0.28 ? "高区" : "中间区",
    percentile1500d: percentile,
    relativeReturn20d,
    thresholdLow: 0.16,
    thresholdHigh: 0.28,
    asOf: current.date,
    quality: common.length >= 21 ? "available" : "low",
  };
}
