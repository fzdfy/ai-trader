import cron from "node-cron";
import { klinePipeRun } from "./pipe";

const CRON = "0 16 * * 1-5"; // 每个交易日下午 4:00（收盘后）

console.log("[kline-worker] starting...");
console.log(`[kline-worker] schedule: ${CRON} (Asia/Shanghai)`);

if (!cron.validate(CRON)) {
  console.error("[kline-worker] invalid cron, exiting");
  process.exit(1);
}

cron.schedule(CRON, async () => {
  console.log("[kline-worker] cron triggered");
  try {
    await klinePipeRun();
  } catch (e) {
    console.error("[kline-worker] error:", e);
  }
}, { timezone: "Asia/Shanghai" });

// 启动后 5 秒先跑一次（初始同步）
setTimeout(() => {
  klinePipeRun().catch((e) => console.error("[kline-worker] init error:", e));
}, 5000);

console.log("[kline-worker] ready");
