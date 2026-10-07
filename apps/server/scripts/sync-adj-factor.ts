/**
 * 定向 / 全量反解复权因子（Route A）。
 *
 * 用法：
 *   pnpm --prefix apps/server sync:adj-factor                   # 全部上市标的
 *   pnpm --prefix apps/server sync:adj-factor 920204.BJ 300750.SZ # 定向指定标的
 * 说明：调 quant /api/v1/data/adjust-params 反解分段仿射参数并 append 快照（PIT 版本化，
 *       只新增不删改）；视图默认取 max(known_at) 的最新快照。定向重跑用于局部修复。
 */
import { adjFactorPipeRun } from "../src/workers/sync-worker/pipes/adj-factor";

const symbols = process.argv.slice(2);
console.log(`[sync-adj-factor] target: ${symbols.length > 0 ? symbols.join(", ") : "全部上市标的"}`);
await adjFactorPipeRun(symbols.length > 0 ? { symbols } : undefined);
console.log("[sync-adj-factor] done");
