/**
 * 手动触发资金流排行同步（行业 / 概念 / 个股）。
 *
 * 用法：node --import @oxc-node/core/register scripts/sync-fundflow.ts
 * 数据源：stock-sdk 东方财富资金流排行接口。
 */
import { fundFlowPipeRun } from "../src/workers/sync-worker/pipes/fundflow";

await fundFlowPipeRun();
