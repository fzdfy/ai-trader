/**
 * 手动触发周期 K 线全量重建（5日/周/月）。
 *
 * 用法：pnpm sync-kline-period
 * 数据来源：bar1d_adj 日线表（需先确保日线数据完整）
 */
import { klinePeriodRebuildAll } from "../src/workers/sync-worker/pipes/kline-period";

await klinePeriodRebuildAll();
