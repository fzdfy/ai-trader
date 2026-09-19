/**
 * 一次性回补日线 K 线的结构性缺口。
 *
 * 用法：pnpm --prefix apps/server backfill:kline1d
 * 说明：定向识别两类当日增量无法自愈的缺口并补拉（显式排除当日，当日由 kline-1d 管道负责）：
 *   - 头部缺失：标的历史只从某天开始（或全无历史）→ 整段全量分页重刷；
 *   - 内部缺口：窗口内缺失但两侧均有行情的交易日 → 只补缺口区间。
 * 通过 force 忽略交易日守卫，可任意时间运行（含周末）；请求量大、耗时较长。
 */
import { kline1dBackfillRun } from "../src/workers/sync-worker/pipes/kline-1d";

console.log("[backfill-kline1d] kline-1d backfill started ...");
await kline1dBackfillRun({ force: true });
console.log("[backfill-kline1d] done");
