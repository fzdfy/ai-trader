import type { RotationWindow } from "./compute";

export interface MainIndexDefinition {
  code: string;
  name: string;
  role: "市场基准" | "大盘核心" | "中盘成长" | "小盘成长" | "成长进攻" | "科技成长" | "防御价值";
  isBenchmark: boolean;
}

export const MAIN_INDEX_DEFINITIONS: readonly MainIndexDefinition[] = [
  {
    code: "000001.SH",
    name: "上证指数",
    role: "市场基准",
    isBenchmark: true,
  },
  { code: "000300.SH", name: "沪深300", role: "大盘核心", isBenchmark: false },
  { code: "000905.SH", name: "中证500", role: "中盘成长", isBenchmark: false },
  { code: "000852.SH", name: "中证1000", role: "小盘成长", isBenchmark: false },
  { code: "399673.SZ", name: "创业板50", role: "成长进攻", isBenchmark: false },
  { code: "000688.SH", name: "科创50", role: "科技成长", isBenchmark: false },
  {
    code: "930955.CSI",
    name: "中证红利低波100",
    role: "防御价值",
    isBenchmark: false,
  },
] as const;

export const MAIN_BENCHMARK_CODE = "000001.SH";
export const MIN_VALID_STYLE_COUNT = 4;

const WINDOW_SIZE: Record<RotationWindow, number> = {
  "5D": 5,
  "20D": 20,
  "60D": 60,
};

export interface BenchmarkSeries {
  code: string;
  name: string;
  points: Array<{ date: string; value: number }>;
}

export interface BenchmarkRotationRow {
  code: string;
  name: string;
  excessReturn: number | null;
  rank: number | null;
  quality: "available" | "missing";
}

export interface BenchmarkRotationResult {
  asOf: string | null;
  benchmarkReturn: number | null;
  validStyleCount: number;
  status: "available" | "low" | "missing";
  rows: BenchmarkRotationRow[];
}

function sortedPoints(series: BenchmarkSeries | undefined): Array<{ date: string; value: number }> {
  if (!series) return [];
  const byDate = new Map<string, number>();
  for (const point of series.points) {
    if (Number.isFinite(point.value) && point.value > 0) {
      byDate.set(point.date, point.value);
    }
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value }));
}

function change(start: number, end: number): number {
  return Math.round((((end / start) - 1) * 100) * 100) / 100;
}

/**
 * Rank style indices only on one shared benchmark trading date.
 * A missing latest bar removes that index from this sample; it is never
 * backfilled from an older date or replaced with zero.
 */
export function computeBenchmarkRotation(
  series: BenchmarkSeries[],
  window: RotationWindow,
): BenchmarkRotationResult {
  const benchmark = series.find((item) => item.code === MAIN_BENCHMARK_CODE);
  const benchmarkPoints = sortedPoints(benchmark);
  const styleDefinitions = MAIN_INDEX_DEFINITIONS.filter((item) => !item.isBenchmark);
  const styleByCode = new Map(series.map((item) => [item.code, item]));
  const size = WINDOW_SIZE[window];

  if (benchmarkPoints.length <= size) {
    return {
      asOf: null,
      benchmarkReturn: null,
      validStyleCount: 0,
      status: "low",
      rows: styleDefinitions.map((definition) => ({
        code: definition.code,
        name: definition.name,
        excessReturn: null,
        rank: null,
        quality: "missing",
      })),
    };
  }

  let selected:
    | {
        asOf: string;
        benchmarkReturn: number;
        returns: Map<string, number>;
      }
    | null = null;
  let latestPartial:
    | {
        asOf: string;
        benchmarkReturn: number;
        returns: Map<string, number>;
      }
    | null = null;

  for (let endIndex = benchmarkPoints.length - 1; endIndex >= size; endIndex -= 1) {
    const end = benchmarkPoints[endIndex]!;
    const start = benchmarkPoints[endIndex - size]!;
    const benchmarkReturn = change(start.value, end.value);
    const returns = new Map<string, number>();

    for (const definition of styleDefinitions) {
      const points = sortedPoints(styleByCode.get(definition.code));
      const byDate = new Map(points.map((point) => [point.date, point.value]));
      const startValue = byDate.get(start.date);
      const endValue = byDate.get(end.date);
      if (startValue != null && endValue != null) {
        const excess = Math.round((change(startValue, endValue) - benchmarkReturn) * 100) / 100;
        returns.set(definition.code, excess);
      }
    }

    if (returns.size >= MIN_VALID_STYLE_COUNT) {
      selected = {
        asOf: end.date,
        benchmarkReturn,
        returns,
      };
      break;
    }
    if (!latestPartial && returns.size > 0) {
      latestPartial = {
        asOf: end.date,
        benchmarkReturn,
        returns,
      };
    }
  }

  selected ??= latestPartial;
  if (!selected) {
    return {
      asOf: null,
      benchmarkReturn: null,
      validStyleCount: 0,
      status: "low",
      rows: styleDefinitions.map((definition) => ({
        code: definition.code,
        name: definition.name,
        excessReturn: null,
        rank: null,
        quality: "missing",
      })),
    };
  }

  const rankedCodes = [...selected.returns.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([code]) => code);
  const ranks = new Map(rankedCodes.map((code, index) => [code, index + 1]));
  const canRank = selected.returns.size >= MIN_VALID_STYLE_COUNT;
  const rows = styleDefinitions.map((definition) => {
    const excessReturn = selected.returns.get(definition.code) ?? null;
    return {
      code: definition.code,
      name: definition.name,
      excessReturn,
      rank: !canRank || excessReturn == null ? null : ranks.get(definition.code) ?? null,
      quality: excessReturn == null ? "missing" as const : "available" as const,
    };
  });
  rows.sort((left, right) => {
    if (left.rank == null && right.rank == null) return 0;
    if (left.rank == null) return 1;
    if (right.rank == null) return -1;
    return left.rank - right.rank;
  });

  return {
    asOf: selected.asOf,
    benchmarkReturn: selected.benchmarkReturn,
    validStyleCount: selected.returns.size,
    status: canRank ? "available" : "low",
    rows,
  };
}
