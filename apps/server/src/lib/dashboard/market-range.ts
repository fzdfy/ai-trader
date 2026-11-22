import type { MarketAssetSession } from "../market-assets/catalog";

export type MarketRange = "1D" | "5D" | "1M" | "YTD";

export interface MarketRangeResolution {
  start: Date;
  end: Date;
  granularity: "minute" | "daily";
}

const TIMEZONES: Record<MarketAssetSession, string> = {
  a_share: "Asia/Shanghai",
  global_gold: "Asia/Shanghai",
  us_equity: "America/New_York",
};

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function timezoneOffsetMs(date: Date, timeZone: string): number {
  const part = localParts(date, timeZone);
  return (
    Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) -
    Math.floor(date.getTime() / 1000) * 1000
  );
}

function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const localAsUtc = Date.UTC(year, month - 1, day);
  let instant = localAsUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    instant = localAsUtc - timezoneOffsetMs(new Date(instant), timeZone);
  }
  return new Date(instant);
}

export function resolveMarketRange(
  range: MarketRange,
  now: Date,
  session: MarketAssetSession,
): MarketRangeResolution {
  const timeZone = TIMEZONES[session];
  if (range === "1D" && session === "global_gold") {
    return {
      start: new Date(now.getTime() - 24 * 60 * 60_000),
      end: now,
      granularity: "minute",
    };
  }
  const { year, month, day } = localParts(now, timeZone);
  if (range === "1D") {
    return {
      start: zonedMidnight(year, month, day, timeZone),
      end: now,
      granularity: "minute",
    };
  }
  if (range === "YTD") {
    return {
      start: zonedMidnight(year, 1, 1, timeZone),
      end: now,
      granularity: "daily",
    };
  }
  const days = range === "5D" ? 7 : 31;
  const shifted = new Date(Date.UTC(year, month - 1, day - days, 12));
  const shiftedParts = localParts(shifted, timeZone);
  return {
    start: zonedMidnight(shiftedParts.year, shiftedParts.month, shiftedParts.day, timeZone),
    end: now,
    granularity: "daily",
  };
}
