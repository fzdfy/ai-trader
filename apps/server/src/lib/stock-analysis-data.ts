export interface AnalysisBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
}

export interface TechnicalSnapshot {
  asOf: string;
  close: number;
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  rsi14: number;
  atr14: number;
  volatility20: number;
  support20: number;
  resistance60: number;
  change20: number;
  change60: number;
  maxDrawdown60: number;
}

export type AnalysisQuality = "available" | "low" | "missing";

export interface ScenarioForecast {
  horizon: "5D" | "20D" | "60D";
  asOf: string | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  upProbability: number | null;
  sampleCount: number;
  backtestHitRate: number | null;
  backtestSampleCount: number;
  modelVersion: string;
  quality: AnalysisQuality;
}

export interface RiskReferenceRange {
  low: number | null;
  high: number | null;
  technical: { low: number; high: number } | null;
  valuation: { low: number; high: number } | null;
  scenario: { low: number; high: number } | null;
  quality: AnalysisQuality;
}

const EXCHANGES = new Set(["SH", "SZ", "BJ"]);

export function normalizeStockSymbol(input: string): string | null {
  const value = input.trim().toUpperCase();
  const match = value.match(/^(?:(SH|SZ|BJ))?(\d{6})(?:\.(SH|SZ|BJ))?$/);
  if (!match) return null;
  const prefix = match[1];
  const code = match[2]!;
  const suffix = match[3];
  if (prefix && suffix && prefix !== suffix) return null;
  const exchange =
    suffix ??
    prefix ??
    (code.startsWith("6") || code.startsWith("5")
      ? "SH"
      : code.startsWith("4") || code.startsWith("8") || code.startsWith("9")
        ? "BJ"
        : "SZ");
  if (!EXCHANGES.has(exchange)) return null;
  return `${code}.${exchange}`;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function quantile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

export function buildScenarioForecasts(bars: AnalysisBar[]): ScenarioForecast[] {
  const closes = bars.map((bar) => bar.close);
  const current = closes.at(-1);
  const asOf = bars.at(-1)?.time ?? null;
  const historySufficient = bars.length >= 80;
  return (
    [
      ["5D", 5],
      ["20D", 20],
      ["60D", 60],
    ] as const
  ).map(([horizon, sessions]) => {
    const historical = closes.slice(sessions).map((close, index) => close / closes[index]! - 1);
    if (!historySufficient || current == null || asOf == null || historical.length < 20) {
      return {
        horizon,
        asOf,
        p10: null,
        p50: null,
        p90: null,
        upProbability: null,
        sampleCount: historical.length,
        backtestHitRate: null,
        backtestSampleCount: 0,
        modelVersion: "historical-bootstrap-v1",
        quality: "missing" as const,
      };
    }
    const prices = historical.map((value) => current * (1 + value)).sort((a, b) => a - b);
    const upProbability = historical.filter((value) => value > 0).length / historical.length;
    const validation = validateForecastWindow(closes, sessions);
    return {
      horizon,
      asOf,
      p10: round(quantile(prices, 0.1)),
      p50: round(quantile(prices, 0.5)),
      p90: round(quantile(prices, 0.9)),
      upProbability: round(upProbability),
      sampleCount: historical.length,
      backtestHitRate: validation.hitRate,
      backtestSampleCount: validation.sampleCount,
      modelVersion: "historical-bootstrap-v1",
      quality: historical.length >= 60 ? ("available" as const) : ("low" as const),
    };
  });
}

function validateForecastWindow(
  closes: number[],
  sessions: number,
): { hitRate: number | null; sampleCount: number } {
  const outcomes: boolean[] = [];
  for (let index = 80; index + sessions < closes.length; index += 1) {
    const history = closes.slice(0, index + 1);
    const returns = history
      .slice(sessions)
      .map((close, offset) => close / history[offset]! - 1)
      .sort((left, right) => left - right);
    if (returns.length < 20) continue;
    const current = closes[index]!;
    const low = current * (1 + quantile(returns, 0.1));
    const high = current * (1 + quantile(returns, 0.9));
    const actual = closes[index + sessions]!;
    outcomes.push(actual >= low && actual <= high);
  }
  return {
    hitRate: outcomes.length > 0 ? round(outcomes.filter(Boolean).length / outcomes.length) : null,
    sampleCount: outcomes.length,
  };
}

export function buildRiskReferenceRange({
  technical,
  forecast,
  valuation,
}: {
  current: number;
  technical: TechnicalSnapshot | null;
  forecast: ScenarioForecast | undefined;
  valuation?: { low: number; high: number } | null;
}): RiskReferenceRange {
  const technicalRange = technical
    ? { low: technical.support20, high: technical.resistance60 }
    : null;
  const scenarioRange =
    forecast?.p10 != null && forecast.p90 != null
      ? { low: forecast.p10, high: forecast.p90 }
      : null;
  const ranges = [technicalRange, valuation ?? null, scenarioRange].filter(
    (value): value is { low: number; high: number } => value != null,
  );
  return {
    low: ranges.length > 0 ? Math.min(...ranges.map((value) => value.low)) : null,
    high: ranges.length > 0 ? Math.max(...ranges.map((value) => value.high)) : null,
    technical: technicalRange,
    valuation: valuation ?? null,
    scenario: scenarioRange,
    quality: ranges.length === 3 ? "available" : ranges.length > 0 ? "low" : "missing",
  };
}

export function buildValuationRange(
  eps: number | null | undefined,
  peHistory: readonly (number | null | undefined)[],
): { low: number; high: number } | null {
  if (eps == null || !Number.isFinite(eps) || eps <= 0) return null;
  const values = peHistory
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (values.length < 5) return null;
  return {
    low: round(quantile(values, 0.2) * eps),
    high: round(quantile(values, 0.8) * eps),
  };
}
