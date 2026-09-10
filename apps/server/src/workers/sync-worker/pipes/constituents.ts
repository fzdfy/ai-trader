/**
 * constituents 管道 — 同步板块成分股到 board_constituent。
 *
 * 数据源：quant 数据服务板块成分股（quant.boardConstituents）。
 * 写入策略：upsert（board_code + symbol 主键，覆盖为最新快照），供热力图二级节点查库。
 *
 * 说明：由 board 表驱动，遍历所有板块拉取成分股；收盘后定时同步。
 */

import { db } from "../../../db";
import { quant } from "../../../lib/quant";
import { notInArray, sql } from "drizzle-orm";
import { board, boardConstituent } from "../../../db/schema";
import { updateProgress } from "../progress";

/** 东财原始代码 → 标准 symbol（60x/68x→.SH，00x/30x→.SZ，43/83/87/88/92→.BJ，已含后缀则原样） */
function codeToSymbol(code: string): string {
  if (code.includes(".")) return code;
  if (/^(60|68)/.test(code)) return `${code}.SH`;
  if (/^(00|30)/.test(code)) return `${code}.SZ`;
  if (/^(43|83|87|88|92)/.test(code)) return `${code}.BJ`;
  return `${code}.SH`;
}

/** 并发拉取上限，避免上游限流 */
const CONCURRENCY = 5;

export async function constituentsPipeRun(): Promise<void> {
  const boards = await db.select({ code: board.code, type: board.type }).from(board);

  if (boards.length === 0) {
    console.log("[constituents] no boards, skip");
    return;
  }

  // 清理已退市/下架板块的成分股（board 表已 prune，此处同步删除孤儿数据）
  const codes = boards.map((b) => b.code);
  const prunedRes = await db.delete(boardConstituent).where(notInArray(boardConstituent.boardCode, codes));
  const pruned = prunedRes.rowCount ?? 0;
  if (pruned > 0) console.log(`[constituents] pruned ${pruned} stale rows`);

  console.log(`[constituents] syncing ${boards.length} boards`);
  updateProgress(0, boards.length, "开始拉取成分股");

  let total = 0;
  let processed = 0;
  for (let i = 0; i < boards.length; i += CONCURRENCY) {
    const chunk = boards.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (b) => {
        const rows = await quant.boardConstituents(b.code).catch((error) => {
          console.error(`[constituents] ${b.code} failed:`, error);
          return [];
        });
        if (rows.length === 0) return;

        // 去重：东财成分股接口偶发返回重复行，而主键 (board_code, symbol) 要求唯一，
        // 同一批 INSERT 内出现重复约束值会报 "ON CONFLICT DO UPDATE command cannot affect row a second time"
        const seen = new Set<string>();
        const batch = [];
        for (const s of rows) {
          const key = `${b.code}:${s.code}`;
          if (seen.has(key)) continue;
          seen.add(key);
          batch.push({
            boardCode: b.code,
            type: b.type,
            symbol: codeToSymbol(s.code),
            name: s.name,
            changePercent: s.change_pct != null ? String(s.change_pct) : null,
            turnoverRate: s.turnover_rate != null ? String(s.turnover_rate) : null,
            amount: s.amount != null ? String(s.amount) : null,
            updatedAt: new Date(),
          });
        }
        total += batch.length;

        for (let j = 0; j < batch.length; j += 200) {
          await db
            .insert(boardConstituent)
            .values(batch.slice(j, j + 200))
            .onConflictDoUpdate({
              target: [boardConstituent.boardCode, boardConstituent.symbol],
              set: {
                type: sql.raw("excluded.type"),
                name: sql.raw("excluded.name"),
                changePercent: sql.raw("excluded.change_percent"),
                turnoverRate: sql.raw("excluded.turnover_rate"),
                amount: sql.raw("excluded.amount"),
                updatedAt: sql.raw("excluded.updated_at"),
              },
            });
        }
      }),
    );
    // 每批处理完上报一次进度
    processed += chunk.length;
    updateProgress(processed, boards.length, `拉取成分股 ${processed}/${boards.length}`);
  }

  console.log(`[constituents] done. ${boards.length} boards, ${total} constituents`);
}
