/**
 * 手动触发板块指数日 K 线同步（board_kline）。
 *
 * 用法：node --import @oxc-node/core/register scripts/sync-board-kline.ts
 * 数据源：quant 数据服务板块指数日 K 线（quant.boardKline）。
 *
 * 说明：由 board 表驱动，遍历所有板块拉取全量历史并 upsert，
 * 供筹码分布（chips/board）查库。
 */
import { boardKlinePipeRun } from "../src/workers/sync-worker/pipes/board-kline";

await boardKlinePipeRun();
