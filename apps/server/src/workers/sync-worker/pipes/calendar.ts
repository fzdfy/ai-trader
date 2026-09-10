/**
 * calendar 管道 — 同步 A 股交易日历到 md.trading_calendar。
 *
 * 数据源：深交所官方交易日历接口（monthList，按月返回，无 key、无风控）。
 * 字段：jyrq(YYYY-MM-DD) / jybz("1"=交易日 "0"=休市) / zrxh(星期序号 1=周日 … 7=周六)。
 *
 * 写入口径：交易日 is_trading_day=true、trade_type=full；非交易日 trade_type=closed
 * 并按 zrxh 标注 reason（weekend 周末 / holiday 法定节假日）。缺行 = 不开盘的安全兜底
 * 语义保持不变（未拉取到的日期仍视为非交易日）。
 *
 * 半日市说明：trade_type 仅写 full / closed，不区分 half_am / half_pm —— 深交所
 * monthList 接口只提供「交易日 / 休市」二元标志，不提供半日市信息，且近年 A 股已
 * 基本取消半日市；如未来需要，需引入上交所日历或人工维护半日市日期补充。
 */
import dayjs from "dayjs";
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { tradingCalendar } from "../../../db/schema";
import { updateProgress } from "../progress";

const SZSE_CALENDAR_URL =
  "https://www.szse.cn/api/report/exchange/onepersistenthour/monthList";

interface SzseDay {
  zrxh: number;
  jybz: string;
  jyrq: string;
}

interface SzseResponse {
  data?: SzseDay[] | null;
}

/** 生成从 startMonth 到 endMonth（含）的月份列表，如 ["2021-01", …] */
function monthsBetween(startMonth: string, endMonth: string): string[] {
  const result: string[] = [];
  let cur = dayjs(`${startMonth}-01`);
  const last = dayjs(`${endMonth}-01`);
  while (cur.isBefore(last) || cur.isSame(last, "month")) {
    result.push(cur.format("YYYY-MM"));
    cur = cur.add(1, "month");
  }
  return result;
}

async function fetchMonth(month: string): Promise<SzseDay[]> {
  const res = await fetch(`${SZSE_CALENDAR_URL}?month=${month}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://www.szse.cn/",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`深交所交易日历接口响应异常: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as SzseResponse;
  return json.data ?? [];
}

/** 休市原因：周末（zrxh 1=周日 / 7=周六）还是法定节假日。 */
function closedReason(zrxh: number): "weekend" | "holiday" {
  return zrxh === 1 || zrxh === 7 ? "weekend" : "holiday";
}

/**
 * 拉取 [startMonth, endMonth] 区间的交易日历并 upsert，返回写入行数。
 */
export async function syncCalendarRange(startMonth: string, endMonth: string): Promise<number> {
  const months = monthsBetween(startMonth, endMonth);
  const seen = new Set<string>();
  const rows: Array<{
    tradeDate: string;
    isTradingDay: boolean;
    tradeType: "full" | "closed";
    reason: string | null;
  }> = [];

  for (const month of months) {
    const days = await fetchMonth(month);
    for (const d of days) {
      if (!d.jyrq || seen.has(d.jyrq)) continue;
      seen.add(d.jyrq);
      const isOpen = d.jybz === "1";
      rows.push({
        tradeDate: d.jyrq,
        isTradingDay: isOpen,
        tradeType: isOpen ? "full" : "closed",
        reason: isOpen ? null : closedReason(Number(d.zrxh)),
      });
    }
  }

  if (rows.length === 0) {
    // 拉取区间覆盖最近 3 年 ~ 未来 12 个月（共 39 个月），正常情况下必然有数据；
    // 全空几乎只会是接口被反爬/改版/代理返回 200 但 data 为空，此时静默 success 会让
    // trading_calendar 缺失今天 → isTradeDay(today)=false → 所有 marketCloseOnly 任务静默停跑。
    // 改为 throw 显式 failed，让 bootstrap 与 cron 能感知并重试。
    throw new Error("[calendar] 交易日历接口返回空数据（疑似反爬或改版），未写入任何记录");
  }

  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(tradingCalendar)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: tradingCalendar.tradeDate,
        set: {
          isTradingDay: sql.raw("excluded.is_trading_day"),
          tradeType: sql.raw("excluded.trade_type"),
          reason: sql.raw("excluded.reason"),
        },
      });
  }

  return rows.length;
}

/**
 * 供 sync-worker 调用的管道入口：同步最近 3 年 ~ 未来 12 个月的交易日历。
 */
export async function calendarPipeRun(): Promise<void> {
  const start = dayjs().subtract(3, "year").format("YYYY-MM");
  const end = dayjs().add(12, "month").format("YYYY-MM");
  updateProgress(0, 1, "开始同步交易日历");
  const count = await syncCalendarRange(start, end);
  updateProgress(1, 1, `交易日历同步完成，写入 ${count} 天`);
  console.log(`[calendar] synced ${count} calendar days (${start} ~ ${end})`);
}
