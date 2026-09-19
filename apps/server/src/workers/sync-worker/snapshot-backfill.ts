/**
 * 快照类管道编排（涨停池 / 龙虎榜 / 题材归因共用）——「当日同步」与「历史回补」彻底分离。
 *
 * 背景：这三类管道的数据源是「按交易日返回的当日快照」。上游可按历史交易日回查，
 * 但此前「当日」与「回补」被塞进同一次串行执行里，导致：
 *   - 当日任务与回补任务耦合在同一次 job_run 里，回补拖慢当日、当日为空又连累回补；
 *   - 无法针对两者分别设定触发时机与重试策略。
 *
 * 因此拆成两个独立入口，由调度层分别触发、各自写独立 jobType：
 *   - runDailySnapshot   —— 只同步「目标交易日」当天，空数据即抛错触发重试。
 *   - runSnapshotBackfill —— 只回补窗口内「表内尚无记录」的历史交易日，空数据跳过。
 *
 * 两个入口互不重叠：回补集合显式排除目标日（当日归 runDailySnapshot 负责）。
 *
 * 空数据语义（关键，避免误判与死重试）：
 *   - 当日为空 → 抛错，让 wrapJob 标 failed 触发 deadline 重试（几乎必是数据未就绪）。
 *   - 历史日为空 → 视为「该日确无数据 / 上游已过保留期」，跳过不抛错，不阻断整体成功；
 *     若实为上游延迟，该日因表内仍无记录会在下次回补重新进入缺失集合，实现自愈。
 *
 * 幂等：按 (date) 落库，重复回补同日由 upsert 覆盖；各 jobType 由 hasSuccessToday 保证同日不重复运行。
 */

import { updateProgress } from "./progress";
import { getSyncTradeDate, listRecentTradeDates } from "./calendar";

/**
 * 回补窗口：最多回看多少个交易日。
 * 涨停池 / 龙虎榜走东财全局串行限流（≥1s 间隔），窗口过大会显著拉长单次回补耗时；
 * 20 个交易日（≈ 一个月）足以覆盖常见宕机 / 停跑导致的尾部断档。
 */
export const SNAPSHOT_BACKFILL_WINDOW = 20;

export type SnapshotSyncOpts<T> = {
  /** 管道名（日志 / 错误信息用，如 "limit-up-pool" / "limit-up-pool-backfill"） */
  label: string;
  /** 中文名（进度文案用，如 "涨停池"） */
  title: string;
  /** 显式指定单个交易日：当日入口只同步该日，回补入口只回补该日；缺省走各自默认语义 */
  date?: string;
  /** 查询目标表在给定日期集合中已落库的日期（仅回补入口使用） */
  existingDates: (dates: string[]) => Promise<Set<string>>;
  /** 拉取单个交易日快照 */
  fetchDate: (date: string) => Promise<T[]>;
  /** upsert 单个交易日快照，返回写入条数 */
  upsert: (date: string, rows: T[]) => Promise<number>;
};

/** 取本次应处理的「目标交易日」：显式 date 优先，否则由交易日历计算 */
async function resolveTargetDate(label: string, date?: string): Promise<string> {
  const target = date ?? (await getSyncTradeDate());
  if (!target) throw new Error(`[${label}] 无可用交易日（交易日历为空或异常）`);
  return target;
}

/**
 * 当日同步：只处理目标交易日。
 * 空数据抛错（数据未就绪）→ 由 wrapJob 标 failed 并在 deadline 内重试。
 */
export async function runDailySnapshot<T>(opts: SnapshotSyncOpts<T>): Promise<void> {
  const { label, title, date, fetchDate, upsert } = opts;
  const target = await resolveTargetDate(label, date);

  updateProgress(0, 1, `开始同步${title}`);
  const rows = await fetchDate(target);
  if (rows.length === 0) {
    throw new Error(`[${label}] ${target} 快照为空（数据未就绪），等待重试`);
  }
  const count = await upsert(target, rows);
  updateProgress(1, 1, `${title}同步完成（${count} 条）`);
  console.log(`[${label}] done. ${target}: ${count} rows upserted`);
}

/**
 * 历史回补：只处理窗口内「表内尚无记录」的历史交易日（显式排除目标日）。
 * 无缺失 → 直接成功返回；历史日为空 → 跳过不抛错（下次运行再尝试，自愈）。
 */
export async function runSnapshotBackfill<T>(opts: SnapshotSyncOpts<T>): Promise<void> {
  const { label, title, date, existingDates, fetchDate, upsert } = opts;

  // 显式指定日期：定点回补该日（区别于当日语义，空数据按历史日跳过而非抛错）。
  if (date) {
    const rows = await fetchDate(date);
    if (rows.length === 0) {
      console.warn(`[${label}] ${date} 快照为空，跳过（指定日，视为无数据 / 已过保留期）`);
      return;
    }
    const count = await upsert(date, rows);
    console.log(`[${label}] backfill ${date}: ${count} rows upserted`);
    return;
  }

  const target = await resolveTargetDate(label);
  const recent = await listRecentTradeDates(SNAPSHOT_BACKFILL_WINDOW, target);
  if (recent.length === 0) {
    console.log(`[${label}] 交易日历无可回补交易日，跳过`);
    return;
  }

  const existing = await existingDates(recent);
  // 排除目标日：当日由 runDailySnapshot 负责，回补只补历史缺口，二者互不重叠。
  // listRecentTradeDates 已按交易日正序返回，filter 保序，无需再排序。
  const missing = recent.filter((d) => d !== target && !existing.has(d));
  if (missing.length === 0) {
    updateProgress(0, 0, `${title}无需回补`);
    console.log(`[${label}] 无缺失交易日（窗口 ${recent.length} 日内），跳过`);
    return;
  }

  console.log(`[${label}] 回补 ${missing.length} 个缺失交易日: ${missing.join(", ")}`);
  updateProgress(0, missing.length, `开始回补${title}`);
  let rowsTotal = 0;
  let done = 0;
  const filled: string[] = [];

  for (const d of missing) {
    const rows = await fetchDate(d);
    if (rows.length === 0) {
      console.warn(`[${label}] ${d} 快照为空，跳过（视为无数据 / 已过保留期，下次运行会再尝试）`);
      done++;
      updateProgress(done, missing.length, `已处理 ${done}/${missing.length} 个交易日`);
      continue;
    }
    const count = await upsert(d, rows);
    rowsTotal += count;
    filled.push(d);
    done++;
    updateProgress(done, missing.length, `已回补 ${done}/${missing.length} 个交易日（${rowsTotal} 条）`);
    console.log(`[${label}] ${d}: ${count} rows upserted`);
  }

  updateProgress(missing.length, missing.length, `${title}回补完成（${rowsTotal} 条）`);
  console.log(
    `[${label}] backfill done. ${rowsTotal} rows across ${missing.length} day(s)` +
      (filled.length > 0 ? `，补齐 ${filled.join(", ")}` : `，全部为空（无数据 / 已过保留期）`),
  );
}
