import { createHash } from "node:crypto";
import { Hono } from "hono";
import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  analystConsensusSnapshot,
  companyAnnouncement,
  fundFlowRank,
  instrument,
  newsArticle,
  newsArticleSymbol,
  researchReport,
  researchReportDocument,
  stockFinancialSnapshot,
  stockAnalysisSnapshot,
  stockValuationDaily,
} from "../db/schema";
import { auth } from "../auth";
import {
  buildRiskReferenceRange,
  buildScenarioForecasts,
  buildValuationRange,
  normalizeStockSymbol,
} from "../lib/stock-analysis-data";
import { badRequest, notFound, ok, serverError } from "../lib/response";
import { syncStockContent } from "../services/stock-content-service";
import { getResearchIndexStatus } from "../services/research-index-service";
import {
  assertResearchDataReady,
  DataGovernanceGateError,
  type ResearchGateDecision,
} from "../lib/data-governance/quality-gate";
import { marketDataReader } from "../lib/market-data-read";
import { technicalObjectAdapter } from "../lib/technical-signals/adapters";
import { buildStockTechnicalSignalModule } from "../lib/technical-signals/stock-analysis";
import { buildSignalJudgmentSummary } from "../lib/technical-signals/judgment";
import type { StockTechnicalModule } from "../lib/technical-signals/stock-analysis";
import { loadStockAdvancedContext } from "../lib/technical-signals/contexts";

const stockAnalysisRoute = new Hono();

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function moduleData<T>(data: T, asOf: string | null, source: string, quality: string) {
  return { data, asOf, source, quality };
}

const emptyTechnicalSignalCounts = {
  triggered: 0,
  neutral: 0,
  invalidated: 0,
  "low-confidence": 0,
  unavailable: 0,
  "not-applicable": 0,
} as const;

async function loadStockTechnicalSignals({
  symbol,
  hfqBars,
  qfqBars,
  computedAt,
  advancedContext,
}: {
  symbol: string;
  hfqBars: Parameters<typeof buildStockTechnicalSignalModule>[0]["hfqBars"];
  qfqBars: Parameters<typeof buildStockTechnicalSignalModule>[0]["qfqBars"];
  computedAt: string;
  advancedContext?: Awaited<ReturnType<typeof loadStockAdvancedContext>> | null;
}): Promise<StockTechnicalModule> {
  try {
    return await buildStockTechnicalSignalModule({
      symbol,
      hfqBars,
      qfqBars,
      computedAt,
      advancedContext,
    });
  } catch (error) {
    console.error(`[stock-analysis] technical signals ${symbol} failed:`, error);
    return {
      catalogVersion: "technical-signals-1.0.0",
      asOf: "",
      computedAt,
      inputHash: "",
      quality: "missing",
      counts: { ...emptyTechnicalSignalCounts },
      summary: buildSignalJudgmentSummary({ objectType: "stock", signals: [] }),
      technical: null,
      signals: [],
    };
  }
}

function governanceNotice(decision: ResearchGateDecision) {
  return decision.warnings.length > 0
    ? {
        governance: {
          mode: decision.mode,
          warnings: decision.warnings,
        },
      }
    : {};
}

stockAnalysisRoute.get("/compare", async (c) => {
  const requested = (c.req.query("symbols") ?? "")
    .split(",")
    .map(normalizeStockSymbol)
    .filter((value): value is string => !!value);
  const symbols = [...new Set(requested)].slice(0, 5);
  if (symbols.length < 1) return badRequest(c, "At least one valid symbol is required");

  try {
    const gate = await assertResearchDataReady("stock_analysis");
    const items = await Promise.all(
      symbols.map(async (symbol) => {
        const [instrumentRows, quoteRead, barsRead, technicalRead, reportCountRows] =
          await Promise.all([
            db.select().from(instrument).where(eq(instrument.symbol, symbol)).limit(1),
            marketDataReader.readQuote(symbol),
            marketDataReader.readDailyBars(symbol, 320),
            technicalObjectAdapter.read("stock", symbol, null, 320).catch(() => null),
            db
              .select({ total: count() })
              .from(researchReport)
              .where(eq(researchReport.symbol, symbol)),
          ]);
        const target = instrumentRows[0];
        const quote = quoteRead.quote;
        const bars = barsRead.bars;
        const technicalSignals = await loadStockTechnicalSignals({
          symbol,
          hfqBars: technicalRead?.bars ?? [],
          qfqBars: bars,
          computedAt: new Date().toISOString(),
          advancedContext:
            (await loadStockAdvancedContext(
              { objectCode: symbol },
              technicalRead ?? {
                identity: {
                  objectType: "stock",
                  objectSubtype: null,
                  objectCode: symbol,
                },
                bars: [],
                benchmark: null,
                priceBasis: "hfq",
                volumeApplicable: true,
                dataSources: [],
                quality: "missing",
                asOf: null,
              },
            ).catch(() => null)) ?? null,
        });
        const technical = technicalSignals.technical;
        const forecasts = buildScenarioForecasts(bars);
        return {
          symbol,
          name: target?.name ?? quote?.name ?? symbol,
          exchange: target?.exchange ?? symbol.split(".").at(-1) ?? "",
          quote: {
            last: quote?.last ?? null,
            changePct: quote?.changePct ?? null,
            pe: quote?.pe ?? null,
            pb: quote?.pb ?? null,
            totalMarketCap: quote?.totalMarketCap ?? null,
            at: quoteRead.asOf,
            source: quoteRead.source,
            quality: quoteRead.quality,
            fallback: quoteRead.fallback,
          },
          reportCount: reportCountRows[0]?.total ?? 0,
          technical,
          technicalSignals,
          forecasts,
          forecastQuality: forecasts.every((item) => item.quality === "available")
            ? "available"
            : forecasts.some((item) => item.quality !== "missing")
              ? "low"
              : "missing",
        };
      }),
    );
    return ok(c, {
      symbols,
      asOf: items[0]?.quote.at ?? null,
      items,
      ...governanceNotice(gate),
    });
  } catch (error) {
    if (error instanceof DataGovernanceGateError) {
      return c.json({ success: false, error: error.message, data: error.decision }, 409);
    }
    console.error("[stock-analysis] compare failed:", error);
    return serverError(c, "个股对比数据读取失败，请稍后重试。");
  }
});

stockAnalysisRoute.post("/:symbol/refresh", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ success: false, error: "Unauthorized" }, 401);
  const symbol = normalizeStockSymbol(c.req.param("symbol"));
  if (!symbol) return badRequest(c, "Unsupported A-share symbol");
  try {
    const gate = await assertResearchDataReady("stock_analysis");
    const content = await syncStockContent(symbol);
    return ok(c, { ...content, ...governanceNotice(gate) });
  } catch (error) {
    if (error instanceof DataGovernanceGateError) {
      return c.json({ success: false, error: error.message, data: error.decision }, 409);
    }
    console.error(`[stock-analysis] refresh ${symbol} failed:`, error);
    return serverError(c, "内容同步失败，请稍后重试。");
  }
});

stockAnalysisRoute.get("/:symbol", async (c) => {
  const symbol = normalizeStockSymbol(c.req.param("symbol"));
  if (!symbol) return badRequest(c, "Unsupported A-share symbol");

  try {
    const gate = await assertResearchDataReady("stock_analysis");
    const [
      instrumentRows,
      quoteRead,
      barsRead,
      technicalRead,
      reportCountRows,
      reportRows,
      fundFlowRow,
      newsRows,
      financialRows,
      consensusRows,
      valuationRows,
      announcementRows,
      reportIndex,
    ] = await Promise.all([
      db.select().from(instrument).where(eq(instrument.symbol, symbol)).limit(1),
      marketDataReader.readQuote(symbol),
      marketDataReader.readDailyBars(symbol, 320),
      technicalObjectAdapter.read("stock", symbol, null, 320).catch(() => null),
      db
        .select({
          total: count(),
          pdfPending: sql<number>`count(*) filter (where ${researchReportDocument.extractStatus} is distinct from 'extracted')::int`,
        })
        .from(researchReport)
        .leftJoin(researchReportDocument, eq(researchReportDocument.reportId, researchReport.id))
        .where(eq(researchReport.symbol, symbol)),
      db
        .select({
          id: researchReport.id,
          source: researchReport.source,
          title: researchReport.title,
          institution: researchReport.institution,
          rating: researchReport.rating,
          publishDate: researchReport.publishDate,
          pdfUrl: researchReport.pdfUrl,
          extractStatus: researchReportDocument.extractStatus,
          storageKey: researchReportDocument.storageKey,
          pageCount: researchReportDocument.pageCount,
        })
        .from(researchReport)
        .leftJoin(researchReportDocument, eq(researchReportDocument.reportId, researchReport.id))
        .where(eq(researchReport.symbol, symbol))
        .orderBy(desc(researchReport.publishDate))
        .limit(8),
      db
        .select()
        .from(fundFlowRank)
        .where(
          and(eq(fundFlowRank.category, "stock"), eq(fundFlowRank.code, symbol.split(".")[0]!)),
        )
        .orderBy(desc(fundFlowRank.date))
        .limit(1),
      db
        .select({
          id: newsArticle.id,
          source: newsArticle.source,
          title: newsArticle.title,
          url: newsArticle.url,
          publishedAt: newsArticle.publishedAt,
        })
        .from(newsArticle)
        .innerJoin(newsArticleSymbol, eq(newsArticleSymbol.articleId, newsArticle.id))
        .where(eq(newsArticleSymbol.symbol, symbol))
        .orderBy(desc(newsArticle.publishedAt))
        .limit(8),
      db
        .select()
        .from(stockFinancialSnapshot)
        .where(eq(stockFinancialSnapshot.symbol, symbol))
        .orderBy(desc(stockFinancialSnapshot.reportPeriod))
        .limit(1),
      db
        .select()
        .from(analystConsensusSnapshot)
        .where(
          and(
            eq(analystConsensusSnapshot.symbol, symbol),
            gte(analystConsensusSnapshot.asOfDate, sql`current_date - interval '400 days'`),
            gte(analystConsensusSnapshot.fiscalYear, sql`extract(year from current_date)::int`),
          ),
        )
        .orderBy(desc(analystConsensusSnapshot.asOfDate), asc(analystConsensusSnapshot.fiscalYear))
        .limit(3),
      db
        .select()
        .from(stockValuationDaily)
        .where(eq(stockValuationDaily.symbol, symbol))
        .orderBy(desc(stockValuationDaily.tradeDate))
        .limit(1000),
      db
        .select()
        .from(companyAnnouncement)
        .where(eq(companyAnnouncement.symbol, symbol))
        .orderBy(desc(companyAnnouncement.publishAt))
        .limit(5),
      getResearchIndexStatus(symbol),
    ]);

    const target = instrumentRows[0];
    if (!target) return notFound(c, `Instrument ${symbol} not found`);

    const quote = quoteRead.quote;
    const bars = barsRead.bars;
    const technicalSignals = await loadStockTechnicalSignals({
      symbol,
      hfqBars: technicalRead?.bars ?? [],
      qfqBars: bars,
      computedAt: new Date().toISOString(),
      advancedContext:
        (await loadStockAdvancedContext(
          { objectCode: symbol },
          technicalRead ?? {
            identity: {
              objectType: "stock",
              objectSubtype: null,
              objectCode: symbol,
            },
            bars: [],
            benchmark: null,
            priceBasis: "hfq",
            volumeApplicable: true,
            dataSources: [],
            quality: "missing",
            asOf: null,
          },
        ).catch(() => null)) ?? null,
    });
    const technical = technicalSignals.technical;
    const forecasts = buildScenarioForecasts(bars);
    const totalMarketCap = quote?.totalMarketCap ?? null;
    const reportCount = reportCountRows[0]?.total ?? 0;
    const reportPdfPending = Number(reportCountRows[0]?.pdfPending ?? 0);
    const flow = fundFlowRow[0];
    const fundRows = flow
      ? [
          {
            date: flow.date,
            close: numberOrNull(flow.price),
            change_pct: numberOrNull(flow.changePercent),
            main_net: numberOrNull(flow.mainNetInflow) ?? 0,
            super_net: numberOrNull(flow.superLargeNetInflow) ?? 0,
            large_net: numberOrNull(flow.largeNetInflow) ?? 0,
            mid_net: numberOrNull(flow.mediumNetInflow) ?? 0,
            small_net: numberOrNull(flow.smallNetInflow) ?? 0,
          },
        ]
      : [];
    const flowNumbers = fundRows.map((row) => row.main_net).filter(Number.isFinite);
    const fundSummary = {
      latest: flowNumbers.at(-1) ?? null,
      fiveDay:
        flowNumbers.length > 0
          ? flowNumbers.slice(-5).reduce((sum, value) => sum + value, 0)
          : null,
      twentyDay: flowNumbers.length > 0 ? flowNumbers.reduce((sum, value) => sum + value, 0) : null,
      asOf: fundRows.at(-1)?.date ?? null,
    };
    const financial = financialRows[0];
    const consensus = consensusRows[0];
    const valuation = valuationRows[0];
    const valuationRange = buildValuationRange(
      numberOrNull(consensus?.epsMean),
      valuationRows.map((row) => numberOrNull(row.peTtm)),
    );
    const riskReferenceRange = buildRiskReferenceRange({
      current: technical?.close ?? quote?.last ?? 0,
      technical,
      forecast: forecasts.find((item) => item.horizon === "20D"),
      valuation: valuationRange,
    });
    const quoteAt = quoteRead.asOf ? new Date(quoteRead.asOf) : null;
    const quoteState = quoteRead.quality;
    const asOfTradeDate = bars.at(-1)?.time.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          symbol,
          barTime: bars.at(-1)?.time ?? null,
          barCount: bars.length,
          quoteAt: quoteRead.asOf,
          quoteLast: quote?.last ?? null,
          consensusAsOf: consensus?.asOfDate ?? null,
          valuationCount: valuationRows.length,
        }),
      )
      .digest("hex");
    await db
      .insert(stockAnalysisSnapshot)
      .values({
        symbol,
        asOfTradeDate,
        quoteAt,
        modelVersion: forecasts[0]?.modelVersion ?? "historical-bootstrap-v1",
        inputHash,
        forecastScenarios: forecasts,
        riskReferenceRange,
        evidenceChunkIds: [],
        dataQuality: {
          quote: quoteState,
          technical: technical ? "available" : "missing",
          reports: reportCount > 0 ? "available" : "missing",
          consensus: consensus ? "available" : "missing",
          valuation: valuationRange ? "available" : "missing",
        },
      })
      .onConflictDoNothing();
    const latestPrice = quote?.last ?? technical?.close ?? null;
    const summaryTitle =
      technical == null
        ? "历史行情不足，暂不生成趋势判断。"
        : latestPrice != null && latestPrice < technical.ma20 && technical.ma20 < technical.ma60
          ? "短期趋势偏弱，价格仍在中期均线下方。"
          : latestPrice != null && latestPrice > technical.ma20 && technical.ma20 > technical.ma60
            ? "趋势结构偏强，价格站在中期均线之上。"
            : "价格处于均线交错区，趋势方向尚未确认。";

    return ok(c, {
      symbol,
      name: target.name,
      exchange: target.exchange,
      status: target.status,
      quote: moduleData(
        quote
          ? {
              last: quote.last,
              change: quote.change,
              changePct: quote.changePct,
              pe: quote.pe,
              pb: quote.pb,
              turnoverRate: quote.turnoverRate,
              totalMarketCap,
              status: quote.status,
              at: quoteRead.asOf,
              source: quoteRead.source,
              quality: quoteRead.quality,
              fallback: quoteRead.fallback,
            }
          : null,
        quoteRead.asOf,
        quoteRead.source,
        quoteState,
      ),
      prices: moduleData(bars.slice(-120), barsRead.asOf, barsRead.source, barsRead.quality),
      technical: moduleData(
        technical,
        technical?.asOf ?? null,
        "quant-technical",
        technical ? technicalSignals.quality : "missing",
      ),
      technicalSignals: moduleData(
        technicalSignals.signals,
        technicalSignals.asOf || null,
        "quant+server",
        technicalSignals.quality,
      ),
      technicalSignalMeta: {
        catalogVersion: technicalSignals.catalogVersion,
        counts: technicalSignals.counts,
        summary: technicalSignals.summary,
        inputHash: technicalSignals.inputHash,
        computedAt: technicalSignals.computedAt,
      },
      forecasts: moduleData(
        forecasts,
        forecasts[0]?.asOf ?? null,
        "historical-bootstrap-v1",
        forecasts.every((item) => item.quality === "available")
          ? "available"
          : forecasts.some((item) => item.quality !== "missing")
            ? "low"
            : "missing",
      ),
      riskReferenceRange: moduleData(
        riskReferenceRange,
        valuation?.tradeDate ?? technical?.asOf ?? null,
        "technical+valuation+scenario",
        riskReferenceRange.quality,
      ),
      reports: moduleData(
        reportRows.map((row) => ({
          ...row,
          publishDate: row.publishDate,
        })),
        reportRows[0]?.publishDate ?? null,
        "research_report",
        reportCount > 0 ? "available" : "missing",
      ),
      reportCount,
      reportPdfPending,
      reportIndex,
      fundamentals: moduleData(
        financial
          ? {
              reportPeriod: financial.reportPeriod,
              metrics: financial.metrics,
            }
          : null,
        financial?.reportPeriod ?? null,
        financial?.source ?? "未接入",
        financial ? "available" : "missing",
      ),
      consensus: moduleData(
        consensus
          ? {
              fiscalYear: consensus.fiscalYear,
              epsMin: numberOrNull(consensus.epsMin),
              epsMean: numberOrNull(consensus.epsMean),
              epsMax: numberOrNull(consensus.epsMax),
              analystCount: consensus.analystCount,
            }
          : null,
        consensus?.asOfDate ?? null,
        consensus?.source ?? "未接入",
        consensus ? "available" : "missing",
      ),
      valuation: moduleData(
        valuation
          ? {
              tradeDate: valuation.tradeDate,
              peTtm: numberOrNull(valuation.peTtm),
              pb: numberOrNull(valuation.pb),
            }
          : null,
        valuation?.tradeDate ?? null,
        valuation?.source ?? "未接入",
        valuation ? "available" : "missing",
      ),
      funds: moduleData(
        fundRows.map((row) => ({
          date: row.date,
          close: row.close,
          changePct: row.change_pct,
          mainNetInflow: row.main_net,
          superLargeNetInflow: row.super_net,
          largeNetInflow: row.large_net,
          mediumNetInflow: row.mid_net,
          smallNetInflow: row.small_net,
        })),
        fundSummary.asOf,
        "eastmoney",
        fundRows.length > 0 ? "available" : "missing",
      ),
      fundSummary,
      news: moduleData(
        newsRows.map((row) => ({ ...row, publishedAt: isoDate(row.publishedAt) })),
        isoDate(newsRows[0]?.publishedAt),
        "news_article",
        newsRows.length > 0 ? "available" : "missing",
      ),
      announcements: moduleData(
        announcementRows,
        isoDate(announcementRows[0]?.publishAt),
        "company_announcement",
        announcementRows.length > 0 ? "available" : "missing",
      ),
      summary: {
        title: summaryTitle,
        body:
          technical == null
            ? "当前只有标的元数据，历史行情不足，无法形成可靠趋势判断。"
            : `价格 ${latestPrice?.toFixed(2) ?? "—"}，MA20 ${technical.ma20.toFixed(2)}，MA60 ${technical.ma60.toFixed(2)}；RSI14 ${technical.rsi14.toFixed(1)}，近 20 日波动率 ${technical.volatility20.toFixed(1)}%。预测为历史统计情景，不构成目标价。`,
        tags: [
          technical ? `收盘价截至 ${technical.asOf.slice(0, 10)}` : "收盘价缺失",
          `研报 ${reportCount} 篇`,
          consensus ? "一致预期可用" : "一致预期缺失",
        ],
        quality:
          technical && reportCount > 0 && consensus ? "available" : technical ? "low" : "missing",
      },
      ...governanceNotice(gate),
    });
  } catch (error) {
    if (error instanceof DataGovernanceGateError) {
      return c.json({ success: false, error: error.message, data: error.decision }, 409);
    }
    console.error(`[stock-analysis] ${symbol} failed:`, error);
    return serverError(c, "个股分析数据读取失败，请稍后重试。");
  }
});

export { stockAnalysisRoute };
