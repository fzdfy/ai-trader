/**
 * 交易日历工具
 *
 * 基于 md.trading_calendar 判断交易日/半日市/交易时段，
 * 并生成 A 股分钟时间点用于对账补洞。
 *
 * A 股常量（不存库，减少冗余）：
 *   上午 09:30 – 11:30
 *   下午 13:00 – 15:00
 */

import { db } from "../../db";
import { tradingCalendar } from "../../db/schema";
import { eq } from "drizzle-orm";

/** A 股交易时段常量 */
const AM_START = { hour: 9, minute: 30 };
const AM_END = { hour: 11, minute: 30 };
const PM_START = { hour: 13, minute: 0 };
const PM_END = { hour: 15, minute: 0 };

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 判断给定日期是否为交易日。
 *
 * 数据源：md.trading_calendar 的 is_trading_day 列。
 * 如果该日期在表中不存在 → 返回 false（安全兜底）。
 */
export async function isTradeDay(date: Date): Promise<boolean> {
  const dayStr = toDateStr(date);
  const [row] = await db
    .select({ isTradingDay: tradingCalendar.isTradingDay })
    .from(tradingCalendar)
    .where(eq(tradingCalendar.tradeDate, dayStr))
    .limit(1);

  return row?.isTradingDay ?? false;
}

/**
 * 获取某天的交易日类型。
 *
 * @returns null 表示该日期不在日历表中
 */
export async function getTradeType(
  date: Date,
): Promise<"full" | "half_am" | "half_pm" | "closed" | null> {
  const dayStr = toDateStr(date);
  const [row] = await db
    .select({ tradeType: tradingCalendar.tradeType })
    .from(tradingCalendar)
    .where(eq(tradingCalendar.tradeDate, dayStr))
    .limit(1);

  return (row?.tradeType as "full" | "half_am" | "half_pm" | "closed" | undefined) ?? null;
}

/**
 * 判断当前是否已过收盘时间（15:00 之后）。
 */
export function isAfterMarketClose(now: Date = new Date()): boolean {
  return now.getHours() * 60 + now.getMinutes() >= PM_END.hour * 60 + PM_END.minute;
}

/**
 * 判断当前是否在 A 股交易时段内。
 */
export function isInTradingHours(now: Date = new Date()): boolean {
  const t = now.getHours() * 60 + now.getMinutes();
  const amS = AM_START.hour * 60 + AM_START.minute;
  const amE = AM_END.hour * 60 + AM_END.minute;
  const pmS = PM_START.hour * 60 + PM_START.minute;
  const pmE = PM_END.hour * 60 + PM_END.minute;
  return (t >= amS && t <= amE) || (t >= pmS && t <= pmE);
}

/**
 * 获取今天的交易日期。
 *
 * @returns 今天是交易日则返回 Date，否则返回 null
 */
export async function getTodayTradeDate(): Promise<Date | null> {
  const today = new Date();
  if (await isTradeDay(today)) {
    return today;
  }
  return null;
}

/**
 * 根据交易日类型生成应有的分钟时间点。
 *
 * - full    → 上午 09:30-11:30 + 下午 13:00-15:00（240 分钟）
 * - half_am → 仅上午 09:30-11:30（120 分钟）
 * - half_pm → 仅下午 13:00-15:00（120 分钟）
 * - closed  → 空数组
 */
export function generateTradeMinutes(
  tradeDate: Date,
  tradeType: "full" | "half_am" | "half_pm" | "closed" = "full",
): Date[] {
  const result: Date[] = [];
  const base = new Date(tradeDate);
  base.setHours(0, 0, 0, 0);

  if (tradeType === "full" || tradeType === "half_am") {
    const amS = new Date(base);
    amS.setHours(AM_START.hour, AM_START.minute, 0, 0);
    const amE = new Date(base);
    amE.setHours(AM_END.hour, AM_END.minute, 0, 0);

    for (let t = new Date(amS); t <= amE; t = new Date(t.getTime() + 60_000)) {
      result.push(new Date(t));
    }
  }

  if (tradeType === "full" || tradeType === "half_pm") {
    const pmS = new Date(base);
    pmS.setHours(PM_START.hour, PM_START.minute, 0, 0);
    const pmE = new Date(base);
    pmE.setHours(PM_END.hour, PM_END.minute, 0, 0);

    for (let t = new Date(pmS); t <= pmE; t = new Date(t.getTime() + 60_000)) {
      result.push(new Date(t));
    }
  }

  return result;
}

/**
 * 根据给定时间找到所属的分钟 bucket 起始时间。
 *
 * 例如 10:23:45 → 10:23:00
 */
export function minuteBucket(ts: Date): Date {
  const d = new Date(ts);
  d.setSeconds(0, 0);
  return d;
}
