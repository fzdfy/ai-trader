/**
 * 回填 board_constituent.symbol：东财裸代码 → 标准 symbol。
 *
 * 背景：constituents 管道历史上直接落库东财 f12 裸代码（600519），
 * 现统一为标准格式（600519.SH），与 limit_up_pool.symbol 等行情表对齐，
 * 消除主线评分 SQL 的跨表 JOIN 格式坑（裸代码 vs 标准格式不一致）。
 *
 * 幂等：仅处理不含 "." 的行，已标准格式的行跳过，可安全重复执行。
 * 用法：node --import @oxc-node/core/register scripts/backfill-constituent-symbol.ts
 */
import { db } from "../src/db";
import { boardConstituent } from "../src/db/schema";
import { sql } from "drizzle-orm";

// 1. 统计裸代码行数（不含 "." 的行）
const countRes = await db.execute(
  sql`SELECT COUNT(*)::int AS n FROM ${boardConstituent} WHERE symbol NOT LIKE '%.%'`,
);
const bare = (countRes.rows[0] as { n: number } | undefined)?.n ?? 0;
console.log(`[backfill] board_constituent 裸代码行数：${bare}`);

// 2. 裸代码 → 标准 symbol（幂等，仅更新不含 "." 的行）
if (bare > 0) {
  const updRes = await db.execute(
    sql`UPDATE ${boardConstituent}
        SET symbol = CASE
          WHEN symbol LIKE '60%' OR symbol LIKE '68%' THEN symbol || '.SH'
          WHEN symbol LIKE '00%' OR symbol LIKE '30%' THEN symbol || '.SZ'
          WHEN symbol LIKE '43%' OR symbol LIKE '83%' OR symbol LIKE '87%' OR symbol LIKE '92%' THEN symbol || '.BJ'
          ELSE symbol || '.SH'
        END
        WHERE symbol NOT LIKE '%.%'`,
  );
  const affected = (updRes as { rowCount?: number }).rowCount ?? 0;
  console.log(`[backfill] 已转换 ${affected} 行`);
} else {
  console.log("[backfill] 无需回填（无裸代码行）");
}
