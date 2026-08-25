/**
 * board-kline 管道 — 同步板块指数日 K 线到 board_kline。
 *
 * 数据源：quant 数据服务板块指数日 K 线（quant.boardKline，全量历史）。
 * 写入策略：upsert（code + time 主键，同日覆盖为最新），供筹码分布（chips/board）查库。
 *
 * 说明：板块指数 K 线无增量参数，每次全量拉取后 upsert 覆盖；收盘后定时同步。
 */

import { db } from "../../../db";
import { quant } from "../../../lib/quant";
import { sql } from "drizzle-orm";
import { board, boardKline } from "../../../db/schema";
import { updateProgress } from "../progress";

/** 并发拉取上限，避免上游限流 */
const CONCURRENCY = 5;

export async function boardKlinePipeRun(): Promise<void> {
  const boards = await db.select({ code: board.code }).from(board);

  if (boards.length === 0) {
    console.log("[board-kline] no boards, skip");
    return;
  }

  console.log(`[board-kline] syncing ${boards.length} boards`);
  updateProgress(0, boards.length, "开始拉取板块指数 K 线");

  let total = 0;
  let processed = 0;
  for (let i = 0; i < boards.length; i += CONCURRENCY) {
    const chunk = boards.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (b) => {
        const klines = await quant.boardKline(b.code).catch((error) => {
          console.error(`[board-kline] ${b.code} failed:`, error);
          return [];
        });
        if (klines.length === 0) return;

        // 去重：主键 (code, time) 要求唯一，同一批 INSERT 内出现重复约束值会报
        // "ON CONFLICT DO UPDATE command cannot affect row a second time"
        const seen = new Set<string>();
        const batch = [];
        for (const k of klines) {
          const key = `${b.code}:${k.time}`;
          if (seen.has(key)) continue;
          seen.add(key);
          batch.push({
            code: b.code,
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
      }),
    );
    // 每批处理完上报一次进度
    processed += chunk.length;
    updateProgress(processed, boards.length, `拉取板块指数 K 线 ${processed}/${boards.length}`);
  }

  console.log(`[board-kline] done. ${boards.length} boards, ${total} bars`);
}
