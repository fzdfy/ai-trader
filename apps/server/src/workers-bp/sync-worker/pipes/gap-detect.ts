import { db } from "../../../db";
import { getTodayTradeDate, getTradeType, generateTradeMinutes } from "../calendar";

export const gapDetectPipe = {
  async run() {
    const tradeDate = await getTodayTradeDate();
    if (!tradeDate) return;

    const tradeType = (await getTradeType(tradeDate)) ?? "full";
    if (tradeType === "closed") return;

    console.log("[gap-detect] running...");
    const expectedMinutes = generateTradeMinutes(tradeDate, tradeType);
    console.log(
      `[gap-detect] trade_type=${tradeType}, expected ${expectedMinutes.length} minutes`,
    );
    // TODO: compare with bar1mAdj and detect gaps
    console.log("[gap-detect] done");
  },
};
