/**
 * 手动触发涨停池同步。
 *
 * 用法：node --import @oxc-node/core/register scripts/sync-limit-up-pool.ts
 * 数据源：quant 数据服务东方财富涨停池接口（getTopicZTPool）。
 */
import { limitUpPoolPipeRun } from "../src/workers/sync-worker/pipes/limit-up-pool";

await limitUpPoolPipeRun();
