import { createTool } from "@mastra/core/tools";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db";
import { bar1dQfq, instrument, quoteLatest } from "../../../db/schema";
import {
  buildRiskReferenceRange,
  buildScenarioForecasts,
  calculateTechnicalSnapshot,
  normalizeStockSymbol,
} from "../../../lib/stock-analysis-data";

export const stockAnalysisTool = createTool({
  id: "getStockAnalysis",
  description:
    "获取个股确定性技术指标、5D/20D/60D 情景预测与风险参考区间。所有数值由代码计算，不生成目标价。",
  inputSchema: z.object({
    symbol: z.string().describe("A 股代码，如 002594.SZ"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    name: z.string().nullable(),
    asOf: z.string().nullable(),
    technical: z.unknown().nullable(),
    forecasts: z.array(z.unknown()),
    riskReferenceRange: z.unknown(),
    quality: z.string(),
  }),
  execute: async ({ symbol }) => {
    const normalized = normalizeStockSymbol(symbol);
    if (!normalized) throw new Error(`Unsupported A-share symbol: ${symbol}`);
    const [targetRows, quoteRows, barRowsDesc] = await Promise.all([
      db.select().from(instrument).where(eq(instrument.symbol, normalized)).limit(1),
      db.select().from(quoteLatest).where(eq(quoteLatest.symbol, normalized)).limit(1),
      db
        .select()
        .from(bar1dQfq)
        .where(eq(bar1dQfq.symbol, normalized))
        .orderBy(desc(bar1dQfq.time))
        .limit(320),
    ]);
    const bars = [...barRowsDesc].reverse().map((bar) => ({
      time: bar.time.toISOString(),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume),
      amount: bar.amount == null ? null : Number(bar.amount),
    }));
    const technical = calculateTechnicalSnapshot(bars);
    const forecasts = buildScenarioForecasts(bars);
    const riskReferenceRange = buildRiskReferenceRange({
      current: technical?.close ?? Number(quoteRows[0]?.last ?? 0),
      technical,
      forecast: forecasts.find((item) => item.horizon === "20D"),
    });
    return {
      symbol: normalized,
      name: targetRows[0]?.name ?? quoteRows[0]?.name ?? null,
      asOf: bars.at(-1)?.time ?? null,
      technical,
      forecasts,
      riskReferenceRange,
      quality: technical ? riskReferenceRange.quality : "missing",
    };
  },
});
