import { db } from "../../../db";
import { isTradeDay } from "../calendar";

export const kline1mPipe = {
  async run() {
    const today = new Date();
    if (!(await isTradeDay(today))) return;
    console.log("[kline-1m] running...");
    // TODO: call kline.cnMinute and upsert bar1mAdj
    console.log("[kline-1m] done");
  },
};
