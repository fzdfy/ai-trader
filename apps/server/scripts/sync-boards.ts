/**
 * 手动触发板块排行同步（board + board_history）。
 *
 * 用法：node --import @oxc-node/core/register scripts/sync-boards.ts
 * 数据源：stock-sdk 东方财富行业/概念板块排行。
 */
import { boardsPipeRun } from "../src/workers/sync-worker/pipes/boards";

await boardsPipeRun();
