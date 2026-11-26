import { and, asc, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  ROTATION_INDEX_SYMBOLS,
  rotationIndexDailyBar,
  type RotationIndexSymbol,
} from "../../db/schema";

export interface RotationIndexBarValue {
  symbol: RotationIndexSymbol;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  amount: number | null;
  source: string;
}

export interface StoredRotationIndexBar extends RotationIndexBarValue {
  observedAt: Date;
}

const decimal = (value: number | null) => (value == null ? null : String(value));

export function dedupeRotationIndexBars(
  values: RotationIndexBarValue[],
): RotationIndexBarValue[] {
  const byKey = new Map<string, RotationIndexBarValue>();
  for (const value of values) {
    if (!(ROTATION_INDEX_SYMBOLS as readonly string[]).includes(value.symbol)) {
      throw new Error(`unknown rotation index: ${value.symbol}`);
    }
    byKey.set(`${value.symbol}|${value.tradeDate}`, value);
  }
  return [...byKey.values()];
}

export async function upsertRotationIndexBars(
  values: RotationIndexBarValue[],
): Promise<number> {
  const deduped = dedupeRotationIndexBars(values);
  if (deduped.length === 0) return 0;
  await db
    .insert(rotationIndexDailyBar)
    .values(
      deduped.map((value) => ({
        symbol: value.symbol,
        tradeDate: value.tradeDate,
        open: String(value.open),
        high: String(value.high),
        low: String(value.low),
        close: String(value.close),
        volume: decimal(value.volume),
        amount: decimal(value.amount),
        source: value.source,
      })),
    )
    .onConflictDoUpdate({
      target: [rotationIndexDailyBar.symbol, rotationIndexDailyBar.tradeDate],
      set: {
        open: sql.raw("excluded.open"),
        high: sql.raw("excluded.high"),
        low: sql.raw("excluded.low"),
        close: sql.raw("excluded.close"),
        volume: sql.raw("excluded.volume"),
        amount: sql.raw("excluded.amount"),
        source: sql.raw("excluded.source"),
        observedAt: new Date(),
      },
    });
  return deduped.length;
}

export async function readRotationIndexBars(
  symbols: readonly RotationIndexSymbol[],
  start?: string,
  end?: string,
  limit = 1000,
): Promise<StoredRotationIndexBar[]> {
  if (symbols.length === 0) return [];
  const rows = await db
    .select()
    .from(rotationIndexDailyBar)
    .where(
      and(
        inArray(rotationIndexDailyBar.symbol, [...symbols]),
        start ? gte(rotationIndexDailyBar.tradeDate, start) : undefined,
        end ? lte(rotationIndexDailyBar.tradeDate, end) : undefined,
      ),
    )
    .orderBy(asc(rotationIndexDailyBar.symbol), asc(rotationIndexDailyBar.tradeDate))
    .limit(Math.min(Math.max(limit, 1), 5000));
  return rows.map((row) => ({
    symbol: row.symbol as RotationIndexSymbol,
    tradeDate: row.tradeDate,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? null : Number(row.volume),
    amount: row.amount == null ? null : Number(row.amount),
    source: row.source,
    observedAt: row.observedAt,
  }));
}
