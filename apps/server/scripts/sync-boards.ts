/**
 * 手动触发板块同步（board + board_history + 成分股）。
 *
 * 用法：node --import @oxc-node/core/register scripts/sync-boards.ts
 * 数据源：stock-sdk 东方财富行业/概念板块排行。
 *
 * 说明：先同步板块排行，再同步各板块成分股（供热力图二级节点查库），
 * 成分股同步失败只告警不阻断（网络波动时板块排行仍可用）。
 */
import { boardsPipeRun } from "../src/workers/sync-worker/pipes/boards";
import { constituentsPipeRun } from "../src/workers/sync-worker/pipes/constituents";

await boardsPipeRun();
try {
  await constituentsPipeRun();
} catch (error) {
  console.error("[sync-boards] constituents sync failed (skip):", error);
}
