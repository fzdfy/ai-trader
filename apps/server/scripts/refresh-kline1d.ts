/**
 * 全量重刷日线 K 线（前复权），用于定期对齐除权后的历史前复权口径。
 *
 * 用法：pnpm --prefix apps/server refresh:kline1d
 * 说明：忽略增量起点，forceFull 从当日往前分页拉取完整前复权日线并 upsert 覆盖；
 *       可任意时间运行（不受收盘守卫限制），全市场标的并发 5 拉取，老标的会翻多页，耗时较长。
 */
import { kline1dPipeRun } from "../src/workers/sync-worker/pipes/kline-1d";

console.log("[refresh-kline1d] full refresh started ...");
await kline1dPipeRun({ forceFull: true });
console.log("[refresh-kline1d] done");
