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

/** 单板块拉取重试次数（上游偶发断连/空结果不可靠，退避重试后再判失败） */
const MAX_FETCH_ATTEMPTS = 3;

/** 全量覆盖容差：应有成分股的板块中未取到的数量 ≤ 该值仍判成功 */
const MISSING_TOLERANCE = 10;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  // 应有成分股的板块基准：当前库内已有成分股的板块集合（约 24 个指数型概念板块天生无成分股，自然排除）。
  const existingRes = await db.execute(sql`
    SELECT DISTINCT board_code FROM board_constituent
  `);
  const required = new Set<string>();
  for (const row of existingRes.rows) {
    const r = row as { board_code: string };
    if (r.board_code != null) required.add(r.board_code);
  }
  // 兜底：库内尚无成分股（首次全量同步）时，退化为全部板块
  if (required.size === 0) for (const b of boards) required.add(b.code);
  const requiredTotal = required.size;

  console.log(`[constituents] syncing ${boards.length} boards`);
  console.log(`[constituents] 应有成分股板块 ${requiredTotal} 个（全部 ${boards.length} 个）`);
  updateProgress(0, requiredTotal, "开始同步成分股");

  let total = 0;
  let done = 0;
  let synced = 0;
  const missingSample: string[] = [];

  const syncOne = async (b: { code: string; type: string }): Promise<{ rows: number; reached: boolean }> => {
    // 空结果/异常几乎必然是上游故障，退避重试后仍空才判失败。
    let rows: Awaited<ReturnType<typeof quant.boardConstituents>> = [];
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        rows = await quant.boardConstituents(b.code);
        if (rows.length > 0) break;
        if (attempt < MAX_FETCH_ATTEMPTS) {
          console.warn(`[constituents] ${b.code} 返回空，${attempt}/${MAX_FETCH_ATTEMPTS} 次后退避重试`);
        }
      } catch (error) {
        lastError = error;
        if (attempt < MAX_FETCH_ATTEMPTS) {
          console.warn(`[constituents] ${b.code} 拉取失败，${attempt}/${MAX_FETCH_ATTEMPTS} 次后退避重试:`, error);
        }
      }
      if (attempt < MAX_FETCH_ATTEMPTS) await sleep(3000 * attempt);
    }

    if (rows.length === 0) {
      console.error(
        `[constituents] ${b.code} 重试 ${MAX_FETCH_ATTEMPTS} 次后仍无成分股（记为未同步）`,
        lastError ?? "",
      );
      return { rows: 0, reached: false };
    }

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

    return { rows: batch.length, reached: batch.length > 0 };
  };

  const queue = boards;
  let idx = 0;
  const worker = async () => {
    while (idx < queue.length) {
      const b = queue[idx++]!;
      const { rows, reached } = await syncOne(b);
      total += rows;
      done++;
      // 仅统计应有成分股的板块：已取到成分股计入已同步，未取到则记入缺失样本
      if (required.has(b.code)) {
        if (reached) synced++;
        else if (missingSample.length < 20) missingSample.push(b.code);
      }
      // 每处理 20 个板块上报一次进度（1000 个板块，逐条上报写库过频）
      if (done % 20 === 0 || done === boards.length) {
        updateProgress(synced, requiredTotal, `已同步成分股 ${synced}/${requiredTotal}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, boards.length) }, () => worker()));

  if (synced === 0) {
    throw new Error(`[constituents] 未取到任何板块成分股数据，未写入有效记录`);
  }

  // 全量覆盖判据：应有成分股的板块中只要未同步数超出容差即判失败，抛错触发上层 deadline
  // 重试，杜绝「部分板块成分股断更但任务仍报 success」的假成功。
  const missing = requiredTotal - synced;
  if (missing > MISSING_TOLERANCE) {
    throw new Error(
      `[constituents] 应有成分股的 ${requiredTotal} 个板块中仍有 ${missing} 个未取到成分股（容差 ${MISSING_TOLERANCE}），任务未完全成功` +
        (missingSample.length > 0 ? `。示例：${missingSample.slice(0, 5).join(", ")}` : ""),
    );
  }

  console.log(`[constituents] done. 已同步 ${synced}/${requiredTotal} 个板块，${total} constituents`);
}
