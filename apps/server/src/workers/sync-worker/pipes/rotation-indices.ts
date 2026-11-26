import { quant, type RotationIndexDailyPayload } from "../../../lib/quant";
import {
  upsertRotationIndexBars,
  type RotationIndexBarValue,
} from "../../../lib/market-rotation/store";

export interface RotationIndexJobDependencies {
  now: () => Date;
  fetchDaily: (start: string, end: string) => Promise<RotationIndexDailyPayload>;
  upsert: (values: RotationIndexBarValue[]) => Promise<number>;
}

export interface RotationIndexJobResult {
  upserted: number;
  failed: Array<{ symbol: string; error: string }>;
}

function dateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function runRotationIndexDailyJob(
  dependencies: RotationIndexJobDependencies,
): Promise<RotationIndexJobResult> {
  const end = dateKey(dependencies.now());
  const startDate = new Date(`${end}T00:00:00+08:00`);
  startDate.setDate(startDate.getDate() - 730);
  const start = startDate.toISOString().slice(0, 10);
  const payload = await dependencies.fetchDaily(start, end);
  const values: RotationIndexBarValue[] = payload.bars.map((bar) => ({
    symbol: bar.symbol,
    tradeDate: bar.trade_date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    amount: bar.amount,
    source: bar.source,
  }));
  if (values.length === 0) {
    throw new Error(
      `rotation indices unavailable: ${payload.errors.map((item) => item.symbol).join(",")}`,
    );
  }
  return {
    upserted: await dependencies.upsert(values),
    failed: payload.errors,
  };
}

export const rotationIndexDailyRun = () =>
  runRotationIndexDailyJob({
    now: () => new Date(),
    fetchDaily: (start, end) => quant.mainIndexDaily(start, end),
    upsert: upsertRotationIndexBars,
  });
