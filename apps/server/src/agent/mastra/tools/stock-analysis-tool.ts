import { createTool } from "@mastra/core/tools";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db";
import { instrument } from "../../../db/schema";
import {
  buildRiskReferenceRange,
  buildScenarioForecasts,
  normalizeStockSymbol,
} from "../../../lib/stock-analysis-data";
import { marketDataReader } from "../../../lib/market-data-read";
import { technicalObjectAdapter } from "../../../lib/technical-signals/adapters";
import { buildStockTechnicalSignalModule } from "../../../lib/technical-signals/stock-analysis";
import { loadStockAdvancedContext } from "../../../lib/technical-signals/contexts";

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
    technicalSignals: z.unknown(),
    forecasts: z.array(z.unknown()),
    riskReferenceRange: z.unknown(),
    quality: z.string(),
  }),
  execute: async ({ symbol }) => {
    const normalized = normalizeStockSymbol(symbol);
    if (!normalized) throw new Error(`Unsupported A-share symbol: ${symbol}`);
    const [targetRows, quoteRead, barsRead, technicalRead] = await Promise.all([
      db.select().from(instrument).where(eq(instrument.symbol, normalized)).limit(1),
      marketDataReader.readQuote(normalized),
      marketDataReader.readDailyBars(normalized, 320),
      technicalObjectAdapter.read("stock", normalized, null, 320).catch(() => null),
    ]);
    const bars = barsRead.bars;
    const quote = quoteRead.quote;
    const technicalSignals = await buildStockTechnicalSignalModule({
      symbol: normalized,
      hfqBars: technicalRead?.bars ?? [],
      qfqBars: bars,
      computedAt: new Date().toISOString(),
      advancedContext: technicalRead
        ? await loadStockAdvancedContext({ objectCode: normalized }, technicalRead).catch(
            () => null,
          )
        : null,
    }).catch(() => null);
    const technical = technicalSignals?.technical ?? null;
    const forecasts = buildScenarioForecasts(bars);
    const riskReferenceRange = buildRiskReferenceRange({
      current: technical?.close ?? quote?.last ?? 0,
      technical,
      forecast: forecasts.find((item) => item.horizon === "20D"),
    });
    return {
      symbol: normalized,
      name: targetRows[0]?.name ?? quote?.name ?? null,
      asOf: barsRead.asOf,
      technical,
      technicalSignals,
      forecasts,
      riskReferenceRange,
      quality: technical ? riskReferenceRange.quality : "missing",
    };
  },
});
