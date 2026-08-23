/**
 * Feature Worker
 *
 * 增量特征计算任务。监听新写入的 bar 数据，
 * 触发对应 symbol 的特征重算。
 *
 * 当前为骨架，使用 pg-boss 作为任务队列。
 */

import PgBoss from "pg-boss";

const boss = new PgBoss(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ai-trader");

export async function startFeatureWorker() {
  await boss.start();

  await boss.work("feature-calc", async (job) => {
    console.log("[feature-worker] processing:", job.data);
    // TODO: calculate features for the given symbol/time range
  });

  console.log("[feature-worker] started");
}
