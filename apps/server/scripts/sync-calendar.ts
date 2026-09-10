/**
 * 一次性/手动同步交易日历（深交所官方接口）。
 *
 * 用法：pnpm --prefix apps/server sync:calendar
 * 默认范围：最近 3 年 ~ 未来 12 个月（与 worker 低频管道保持一致）。
 */
import dayjs from "dayjs";
import { syncCalendarRange } from "../src/workers/sync-worker/pipes/calendar";

const start = dayjs().subtract(3, "year").format("YYYY-MM");
const end = dayjs().add(12, "month").format("YYYY-MM");

console.log(`[sync-calendar] syncing ${start} ~ ${end} ...`);
const count = await syncCalendarRange(start, end);
console.log(`[sync-calendar] done. wrote ${count} days`);
