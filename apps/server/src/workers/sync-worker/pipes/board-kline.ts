/**
 * board-kline 管道 — 同步板块指数日 K 线到 board_kline。
 *
 * 数据源：quant 数据服务板块指数日 K 线（quant.boardKline，全量历史）。
 * 写入策略：upsert（code + time 主键，同日覆盖为最新），供筹码分布（chips/board）查库。
 *
 * 说明：板块指数 K 线无增量参数，每次全量拉取后 upsert 覆盖；收盘后定时同步。
 * 上游（东财 push2his kline）会被 WAF 拦截，quant 侧已做 `/..` 绕过；本管道在其上
 * 加重试/降速与失败统计，任一板块拉取失败或未取到期望交易日都会抛错触发 deadline 重试，
 * 杜绝「部分板块数据断更但任务仍报 success」的假成功。
 */

import { db } from "../../../db";
import { getPrevTradeDate, getSyncTradeDate } from "../calendar";
import { quant, type BoardKlineBar } from "../../../lib/quant";
import { notInArray, sql } from "drizzle-orm";
import { board, boardKline } from "../../../db/schema";
import { updateProgress } from "../progress";
import dayjs from "dayjs";

/** 并发拉取上限，避免上游限流 */
const CONCURRENCY = 2;

/** 单板块拉取重试次数（上游偶发断连/空结果不可靠，退避重试后再判失败） */
const MAX_FETCH_ATTEMPTS = 3;

/** 每个板块处理后的降速间隔 */
const THROTTLE_MS = 400;

/** 全量覆盖容差：可交易板块中未取到当日 K 线的数量 ≤ 该值仍判成功 */
const MISSING_TOLERANCE = 10;

/**
 * 连续无数据板块上限：超过即判定上游（东财 push2）整体不可用（限流/封禁），
 * 立即抛错中止本轮，避免继续空转 ~973 个板块、反复探测而延长封禁窗口。
 */
const CONSECUTIVE_FAILURE_LIMIT = 20;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function boardKlinePipeRun(): Promise<void> {
  const boards = await db.select({ code: board.code }).from(board);

  if (boards.length === 0) {
    console.log("[board-kline] no boards, skip");
    return;
  }

  // 清理已退市/下架板块的历史 K 线（board 表已 prune，此处同步删除孤儿数据）
  const codes = boards.map((b) => b.code);
  const prunedRes = await db.delete(boardKline).where(notInArray(boardKline.code, codes));
  const pruned = prunedRes.rowCount ?? 0;
  if (pruned > 0) console.log(`[board-kline] pruned ${pruned} stale rows`);

  console.log(`[board-kline] syncing ${boards.length} boards`);

  // 期望落库到的最新交易日（口径与 kline-1d / boards 等管道一致）
  const expectedDate = (await getSyncTradeDate()) ?? dayjs().format("YYYY-MM-DD");

  // 可交易板块基准：上一交易日仍有 K 线的板块视为可交易（已下架/长期无行情板块不计入分母）。
  const prevTradeDate = await getPrevTradeDate(expectedDate);
  const latestRes = await db.execute(sql`
    SELECT code, MAX(time) AS latest FROM board_kline GROUP BY code
  `);
  const active = new Set<string>();
  for (const row of latestRes.rows) {
    const r = row as { code: string; latest: Date | string | null };
    if (r.latest == null) continue;
    const latest = dayjs(r.latest).format("YYYY-MM-DD");
    if (prevTradeDate == null || latest >= prevTradeDate) active.add(r.code);
  }
  // 兜底：无任何历史（首次全量同步）或交易日历缺失时，退化为全部板块
  if (active.size === 0) for (const b of boards) active.add(b.code);
  const activeTotal = active.size;
  console.log(
    `[board-kline] 可交易板块 ${activeTotal} 个（全部 ${boards.length} 个，上一交易日 ${prevTradeDate ?? "未知"}）`,
  );

  let total = 0;
  let done = 0;
  let synced = 0;
  let consecutiveFailures = 0;
  const missingSample: string[] = [];

  const syncOne = async (code: string): Promise<{ bars: number; reached: boolean }> => {
    // 全量历史：空结果/异常几乎必然是上游故障，退避重试后仍空才判失败。
    let klines: BoardKlineBar[] = [];
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        klines = await quant.boardKline(code);
        if (klines.length > 0) break;
        if (attempt < MAX_FETCH_ATTEMPTS) {
          console.warn(`[board-kline] ${code} 返回空，${attempt}/${MAX_FETCH_ATTEMPTS} 次后退避重试`);
        }
      } catch (error) {
        lastError = error;
        if (attempt < MAX_FETCH_ATTEMPTS) {
          console.warn(`[board-kline] ${code} 拉取失败，${attempt}/${MAX_FETCH_ATTEMPTS} 次后退避重试:`, error);
        }
      }
      if (attempt < MAX_FETCH_ATTEMPTS) await sleep(3000 * attempt);
    }

    if (klines.length === 0) {
      console.error(
        `[board-kline] ${code} 重试 ${MAX_FETCH_ATTEMPTS} 次后仍无数据（记为未同步）`,
        lastError ?? "",
      );
      return { bars: 0, reached: false };
    }

    // 去重：主键 (code, time) 要求唯一，同一批 INSERT 内出现重复约束值会报
    // "ON CONFLICT DO UPDATE command cannot affect row a second time"
    const seen = new Set<string>();
    const batch = [];
    for (const k of klines) {
      const key = `${code}:${k.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      batch.push({
        code,
        time: new Date(k.time),
        open: String(k.open ?? 0),
        high: String(k.high ?? 0),
        low: String(k.low ?? 0),
        close: String(k.close ?? 0),
        volume: String(k.volume ?? 0),
        amount: k.amount == null ? null : String(k.amount),
        ingestedAt: new Date(),
      });
    }

    for (let j = 0; j < batch.length; j += 200) {
      await db
        .insert(boardKline)
        .values(batch.slice(j, j + 200))
        .onConflictDoUpdate({
          target: [boardKline.code, boardKline.time],
          set: {
            open: sql.raw("excluded.open"),
            high: sql.raw("excluded.high"),
            low: sql.raw("excluded.low"),
            close: sql.raw("excluded.close"),
            volume: sql.raw("excluded.volume"),
            amount: sql.raw("excluded.amount"),
            ingestedAt: sql.raw("excluded.ingested_at"),
          },
        });
    }

    // 是否真的取到期望交易日的数据：非空但止于上一交易日视为「未同步」。
    // 上游当晚尚未发布当日 K 线时会返回上一交易日为止的非空窗口，若仅判空会误当成功。
    // 已取到的历史仍写入（幂等覆盖，防数据回退），由末尾覆盖率判据决定是否重跑。
    let latestFetched = klines[0]!.time;
    for (const k of klines) {
      if (k.time > latestFetched) latestFetched = k.time;
    }
    const reached = latestFetched >= expectedDate;
    if (!reached) {
      console.warn(
        `[board-kline] ${code} 最新仅到 ${latestFetched}（期望 ${expectedDate}），疑似上游尚未发布当日数据`,
      );
    }
    return { bars: batch.length, reached };
  };

  updateProgress(0, activeTotal, "开始同步板块指数 K 线");

  const queue = boards.map((b) => b.code);
  let idx = 0;
  const worker = async () => {
    while (idx < queue.length) {
      const code = queue[idx++]!;
      const { bars, reached } = await syncOne(code);
      total += bars;
      done++;
      // 上游整体不可用（限流/封禁）时快速失败退出，不空转剩余板块、避免加剧封禁
      if (bars === 0) {
        consecutiveFailures++;
        if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
          throw new Error(
            `[board-kline] 连续 ${consecutiveFailures} 个板块均未取到 K 线，判定上游（东财 push2）不可用，提前中止本轮以免加剧限流`,
          );
        }
      } else {
        consecutiveFailures = 0;
      }
      // 仅统计可交易板块：已取到当日 K 线计入已同步，未取到则记入缺失样本
      if (active.has(code)) {
        if (reached) synced++;
        else if (missingSample.length < 20) missingSample.push(code);
      }
      // 每处理 20 个板块上报一次进度（1000 个板块，逐条上报写库过频）
      if (done % 20 === 0 || done === boards.length) {
        updateProgress(synced, activeTotal, `已同步板块指数 K 线 ${synced}/${activeTotal}`);
      }
      await sleep(THROTTLE_MS);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, boards.length) }, () => worker()));

  if (synced === 0) {
    throw new Error(`[board-kline] 未取到 ${expectedDate} 当日任何板块 K 线数据，未写入有效记录`);
  }

  // 全量覆盖判据：可交易板块中只要未同步数超出容差即判失败，抛错触发上层 deadline 重试，
  // 杜绝「部分板块数据断更但任务仍报 success」的假成功。
  const missing = activeTotal - synced;
  if (missing > MISSING_TOLERANCE) {
    throw new Error(
      `[board-kline] 可交易板块 ${activeTotal} 个中仍有 ${missing} 个未取到 ${expectedDate} 当日 K 线（容差 ${MISSING_TOLERANCE}），任务未完全成功` +
        (missingSample.length > 0 ? `。示例：${missingSample.slice(0, 5).join(", ")}` : ""),
    );
  }

  console.log(`[board-kline] done. 已同步 ${synced}/${activeTotal} 个可交易板块，${total} bars`);
}
