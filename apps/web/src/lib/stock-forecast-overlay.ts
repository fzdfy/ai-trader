export interface StockForecastOverlayInput {
  current: number;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  startTimestamp: number;
  sessions?: number;
}

export interface StockForecastOverlayPoint {
  timestamp: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface StockForecastOverlay {
  points: StockForecastOverlayPoint[];
}

function nextBusinessDay(timestamp: number): number {
  const next = new Date(timestamp);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);
  return next.getTime();
}

function interpolate(current: number, target: number, progress: number): number {
  if (current <= 0 || target <= 0) return Number.NaN;
  return current * (target / current) ** progress;
}

export function buildStockForecastOverlay({
  current,
  p10,
  p50,
  p90,
  startTimestamp,
  sessions = 5,
}: StockForecastOverlayInput): StockForecastOverlay | null {
  if (
    !Number.isFinite(current) ||
    current <= 0 ||
    p10 == null ||
    p50 == null ||
    p90 == null ||
    !Number.isFinite(p10) ||
    !Number.isFinite(p50) ||
    !Number.isFinite(p90) ||
    p10 > p50 ||
    p50 > p90 ||
    !Number.isInteger(sessions) ||
    sessions < 1
  ) {
    return null;
  }

  const points: StockForecastOverlayPoint[] = [];
  let timestamp = startTimestamp;
  for (let step = 0; step <= sessions; step += 1) {
    const progress = step / sessions;
    const isEnd = step === sessions;
    points.push({
      timestamp,
      p10: isEnd ? p10 : interpolate(current, p10, progress),
      p50: isEnd ? p50 : interpolate(current, p50, progress),
      p90: isEnd ? p90 : interpolate(current, p90, progress),
    });
    if (!isEnd) timestamp = nextBusinessDay(timestamp);
  }
  return { points };
}
