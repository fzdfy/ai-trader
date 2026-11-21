import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import {
  analystConsensusSnapshot,
  companyAnnouncement,
  instrument,
  newsArticle,
  newsArticleSymbol,
  researchReport,
  researchReportForecast,
  stockFinancialSnapshot,
  stockValuationDaily,
  syncCursor,
} from "../db/schema";
import {
  quant,
  type AnalystConsensusItem,
  type AnnouncementItem,
  type FinancialSnapshotItem,
  type NewsItem,
  type ValuationDailyItem,
} from "../lib/quant";
import { normalizeStockSymbol } from "../lib/stock-analysis-data";
import {
  RESEARCH_METADATA_SYNC_ENDPOINT,
  RESEARCH_METADATA_SYNC_SOURCE,
  RESEARCH_METADATA_SYNC_TIMEFRAME,
} from "./research-index-contracts";

export interface ContentModuleResult {
  ok: boolean;
  inserted: number;
  total: number;
  observedAt: string;
  error: string | null;
}

export interface StockContentResult {
  symbol: string;
  modules: {
    news: ContentModuleResult;
    announcements: ContentModuleResult;
    reports: ContentModuleResult;
    analystConsensus: ContentModuleResult;
    financialSnapshot: ContentModuleResult;
    financialStatements: ContentModuleResult;
    valuationHistory: ContentModuleResult;
  };
}

function result(
  ok: boolean,
  inserted: number,
  total: number,
  observedAt: string,
  error: unknown = null,
): ContentModuleResult {
  return {
    ok,
    inserted,
    total,
    observedAt,
    error: error == null ? null : error instanceof Error ? error.message : String(error),
  };
}

function numericString(value: number | null | undefined): string | null {
  return value == null || !Number.isFinite(value) ? null : String(value);
}

function dedupeByKey<T>(items: T[], keyOf: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [keyOf(item), item])).values()];
}

export function shanghaiDate(instant = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function linkSymbols(symbol: string | null, related: string[]): string[] {
  return [
    ...new Set(
      [...(symbol ? [symbol] : []), ...related]
        .map((item) => normalizeStockSymbol(item))
        .filter((item): item is string => item != null),
    ),
  ];
}

const LEGAL_STOCK_CODE = /^(60|68|00|30|43|83|87|88|92)/;

async function bodySymbols(items: NewsItem[]): Promise<Map<string, string[]>> {
  const byUrl = new Map<string, string[]>();
  const candidates = new Set<string>();
  for (const item of items) {
    const matches = `${item.title} ${item.content ?? ""}`.match(/\b\d{6}\b/g) ?? [];
    const symbols = matches
      .filter((code) => LEGAL_STOCK_CODE.test(code))
      .map(normalizeStockSymbol)
      .filter((value): value is string => value != null);
    byUrl.set(item.url, symbols);
    for (const symbol of symbols) candidates.add(symbol);
  }
  if (candidates.size === 0) return byUrl;
  const known = await db
    .select({ symbol: instrument.symbol })
    .from(instrument)
    .where(inArray(instrument.symbol, [...candidates]));
  const knownSet = new Set(known.map((row) => row.symbol));
  for (const [url, symbols] of byUrl) {
    byUrl.set(
      url,
      symbols.filter((symbol) => knownSet.has(symbol)),
    );
  }
  return byUrl;
}

async function saveNews(symbol: string | null, items: NewsItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const normalized = items.map((item) =>
    item.url
      ? item
      : {
          ...item,
          url: `fallback:${item.source}:${createHash("md5")
            .update(
              [item.source, item.title, item.published_at ?? "", item.content ?? ""].join("|"),
            )
            .digest("hex")}`,
        },
  );
  const inserted = await db
    .insert(newsArticle)
    .values(
      normalized.map((item) => ({
        source: item.source,
        title: item.title,
        content: item.content,
        url: item.url,
        publishedAt: item.published_at ? new Date(item.published_at) : null,
        rawJson: item,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: newsArticle.id, source: newsArticle.source, url: newsArticle.url });

  const urls = [...new Set(normalized.map((item) => item.url))];
  const recognized = await bodySymbols(normalized);
  const existing = await db
    .select({ id: newsArticle.id, source: newsArticle.source, url: newsArticle.url })
    .from(newsArticle)
    .where(inArray(newsArticle.url, urls));
  const ids = new Map(existing.map((row) => [`${row.source}\0${row.url}`, row.id]));
  const links = normalized.flatMap((item) => {
    const articleId = ids.get(`${item.source}\0${item.url}`);
    if (!articleId) return [];
    return linkSymbols(symbol, [...item.related_symbols, ...(recognized.get(item.url) ?? [])]).map(
      (relatedSymbol) => ({
        articleId,
        symbol: relatedSymbol,
        relationType:
          symbol != null && relatedSymbol === symbol ? "query_symbol" : "recognized_symbol",
      }),
    );
  });
  if (links.length > 0) {
    await db.insert(newsArticleSymbol).values(links).onConflictDoNothing();
  }
  return inserted.length;
}

export async function ingestNewsItems(items: NewsItem[], symbol?: string): Promise<number> {
  return saveNews(symbol ?? null, items);
}

async function saveAnnouncements(symbol: string, items: AnnouncementItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const inserted = await db
    .insert(companyAnnouncement)
    .values(
      items.map((item) => ({
        symbol,
        title: item.title,
        announcementType: item.announcement_type,
        publishAt: new Date(item.published_at),
        sourceUrl: item.url,
        source: item.source,
        rawJson: item,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: companyAnnouncement.id });

  await db
    .insert(companyAnnouncement)
    .values(
      items.map((item) => ({
        symbol,
        title: item.title,
        announcementType: item.announcement_type,
        publishAt: new Date(item.published_at),
        sourceUrl: item.url,
        source: item.source,
        rawJson: item,
      })),
    )
    .onConflictDoUpdate({
      target: [companyAnnouncement.source, companyAnnouncement.sourceUrl],
      set: {
        title: sql`excluded.title`,
        announcementType: sql`excluded.announcement_type`,
        publishAt: sql`excluded.publish_at`,
        rawJson: sql`excluded.raw_json`,
        fetchedAt: sql`now()`,
      },
    });
  return inserted.length;
}

const RESEARCH_METADATA_OVERLAP_DAYS = 7;

function reportCutoff(now: Date): string {
  return shanghaiDate(new Date(now.getTime() - 365 * 86_400_000));
}

async function researchMetadataCursor(symbol: string): Promise<Date | null> {
  const [row] = await db
    .select({
      cursorTime: syncCursor.cursorTime,
      updatedAt: syncCursor.updatedAt,
    })
    .from(syncCursor)
    .where(
      and(
        eq(syncCursor.source, RESEARCH_METADATA_SYNC_SOURCE),
        eq(syncCursor.endpoint, RESEARCH_METADATA_SYNC_ENDPOINT),
        eq(syncCursor.symbol, symbol),
        eq(syncCursor.timeframe, RESEARCH_METADATA_SYNC_TIMEFRAME),
      ),
    )
    .limit(1);
  if (!row) return null;
  const value = row.cursorTime ?? row.updatedAt;
  return value instanceof Date ? value : new Date(value);
}

function metadataBeginTime(cursor: Date | null, cutoff: string): string {
  if (!cursor || !Number.isFinite(cursor.getTime())) return cutoff;
  const cursorBegin = shanghaiDate(
    new Date(cursor.getTime() - RESEARCH_METADATA_OVERLAP_DAYS * 86_400_000),
  );
  return cursorBegin > cutoff ? cursorBegin : cutoff;
}

async function saveReports(
  symbol: string,
  items: Awaited<ReturnType<typeof quant.researchReports>>["items"],
  cutoff: string,
): Promise<number> {
  const recent = items.filter((item) => item.publish_date >= cutoff);
  if (recent.length === 0) return 0;
  const values = recent.map((item) => ({
    source: item.source,
    sourceId: item.source_id,
    symbol,
    title: item.title,
    institution: item.institution,
    analysts: item.analysts,
    rating: item.rating,
    industry: item.industry,
    publishDate: item.publish_date,
    pdfUrl: item.pdf_url,
    rawJson: item.raw,
  }));
  const inserted = await db
    .insert(researchReport)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: researchReport.id });
  const saved = await db
    .insert(researchReport)
    .values(values)
    .onConflictDoUpdate({
      target: [researchReport.source, researchReport.sourceId],
      set: {
        title: sql`excluded.title`,
        institution: sql`excluded.institution`,
        analysts: sql`excluded.analysts`,
        rating: sql`excluded.rating`,
        industry: sql`excluded.industry`,
        publishDate: sql`excluded.publish_date`,
        pdfUrl: sql`excluded.pdf_url`,
        rawJson: sql`excluded.raw_json`,
        fetchedAt: sql`now()`,
      },
    })
    .returning({ id: researchReport.id, sourceId: researchReport.sourceId });
  const ids = new Map(saved.map((row) => [row.sourceId, row.id]));
  const forecasts = recent.flatMap((item) =>
    item.forecasts.flatMap((forecast) => {
      const reportId = ids.get(item.source_id);
      return reportId
        ? [
            {
              reportId,
              horizon: forecast.horizon,
              eps: forecast.eps == null ? null : String(forecast.eps),
              rawValue: forecast.raw_value == null ? null : String(forecast.raw_value),
            },
          ]
        : [];
    }),
  );
  if (forecasts.length > 0) {
    await db
      .insert(researchReportForecast)
      .values(forecasts)
      .onConflictDoUpdate({
        target: [researchReportForecast.reportId, researchReportForecast.horizon],
        set: {
          eps: sql`excluded.eps`,
          rawValue: sql`excluded.raw_value`,
        },
      });
  }
  return inserted.length;
}

async function saveAnalystConsensus(
  symbol: string,
  items: AnalystConsensusItem[],
): Promise<number> {
  if (items.length === 0) return 0;
  const unique = dedupeByKey(
    items,
    (item) => `${item.as_of_date}\0${item.fiscal_year}\0${item.source}`,
  );
  const values = unique.map((item) => ({
    symbol,
    asOfDate: item.as_of_date,
    fiscalYear: item.fiscal_year,
    epsMin: numericString(item.eps_min),
    epsMean: numericString(item.eps_mean),
    epsMax: numericString(item.eps_max),
    analystCount: item.analyst_count,
    source: item.source,
    rawJson: item.raw,
  }));
  const inserted = await db
    .insert(analystConsensusSnapshot)
    .values(values)
    .onConflictDoNothing()
    .returning({ fiscalYear: analystConsensusSnapshot.fiscalYear });
  await db
    .insert(analystConsensusSnapshot)
    .values(values)
    .onConflictDoUpdate({
      target: [
        analystConsensusSnapshot.symbol,
        analystConsensusSnapshot.asOfDate,
        analystConsensusSnapshot.fiscalYear,
        analystConsensusSnapshot.source,
      ],
      set: {
        epsMin: sql`excluded.eps_min`,
        epsMean: sql`excluded.eps_mean`,
        epsMax: sql`excluded.eps_max`,
        analystCount: sql`excluded.analyst_count`,
        rawJson: sql`excluded.raw_json`,
        fetchedAt: sql`now()`,
      },
    });
  return inserted.length;
}

async function saveFinancialSnapshots(
  symbol: string,
  items: FinancialSnapshotItem[],
): Promise<number> {
  if (items.length === 0) return 0;
  const unique = dedupeByKey(
    items,
    (item) => `${item.report_period}\0${item.statement_type}\0${item.source}`,
  );
  const values = unique.map((item) => ({
    symbol,
    reportPeriod: item.report_period,
    statementType: item.statement_type,
    source: item.source,
    metrics: item.metrics,
    rawJson: item.raw,
  }));
  const inserted = await db
    .insert(stockFinancialSnapshot)
    .values(values)
    .onConflictDoNothing()
    .returning({ reportPeriod: stockFinancialSnapshot.reportPeriod });
  await db
    .insert(stockFinancialSnapshot)
    .values(values)
    .onConflictDoUpdate({
      target: [
        stockFinancialSnapshot.symbol,
        stockFinancialSnapshot.reportPeriod,
        stockFinancialSnapshot.statementType,
        stockFinancialSnapshot.source,
      ],
      set: {
        metrics: sql`excluded.metrics`,
        rawJson: sql`excluded.raw_json`,
        fetchedAt: sql`now()`,
      },
    });
  return inserted.length;
}

async function saveValuationHistory(symbol: string, items: ValuationDailyItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const unique = dedupeByKey(items, (item) => `${item.trade_date}\0${item.source}`);
  const values = unique.map((item) => ({
    symbol,
    tradeDate: item.trade_date,
    peTtm: numericString(item.pe_ttm),
    peStatic: numericString(item.pe_static),
    pb: numericString(item.pb),
    psTtm: numericString(item.ps_ttm),
    pcf: numericString(item.pcf),
    turnoverRate: numericString(item.turnover_rate),
    tradeStatus: item.trade_status,
    isSt: item.is_st,
    source: item.source,
    rawJson: item.raw,
  }));
  const inserted = await db
    .insert(stockValuationDaily)
    .values(values)
    .onConflictDoNothing()
    .returning({ tradeDate: stockValuationDaily.tradeDate });
  await db
    .insert(stockValuationDaily)
    .values(values)
    .onConflictDoUpdate({
      target: [
        stockValuationDaily.symbol,
        stockValuationDaily.tradeDate,
        stockValuationDaily.source,
      ],
      set: {
        peTtm: sql`excluded.pe_ttm`,
        peStatic: sql`excluded.pe_static`,
        pb: sql`excluded.pb`,
        psTtm: sql`excluded.ps_ttm`,
        pcf: sql`excluded.pcf`,
        turnoverRate: sql`excluded.turnover_rate`,
        tradeStatus: sql`excluded.trade_status`,
        isSt: sql`excluded.is_st`,
        rawJson: sql`excluded.raw_json`,
      },
    });
  return inserted.length;
}

export async function syncStockNews(symbol: string): Promise<ContentModuleResult> {
  try {
    const items = await quant.stockNews(symbol, 20);
    const inserted = await ingestNewsItems(items, symbol);
    return result(true, inserted, items.length, new Date().toISOString());
  } catch (error) {
    return result(false, 0, 0, new Date().toISOString(), error);
  }
}

export async function syncStockAnnouncements(symbol: string): Promise<ContentModuleResult> {
  try {
    const items = await quant.announcements(symbol, 30, 30);
    const inserted = await saveAnnouncements(symbol, items);
    return result(true, inserted, items.length, new Date().toISOString());
  } catch (error) {
    return result(false, 0, 0, new Date().toISOString(), error);
  }
}

export async function syncStockResearchReports(
  symbol: string,
  now = new Date(),
): Promise<ContentModuleResult> {
  try {
    const cutoff = reportCutoff(now);
    const beginTime = metadataBeginTime(await researchMetadataCursor(symbol), cutoff);
    const collected: Awaited<ReturnType<typeof quant.researchReports>>["items"] = [];
    let page = 1;
    for (;;) {
      const response = await quant.researchReports(symbol, page, 100, beginTime);
      collected.push(...response.items);
      if (response.items.length < 100 || collected.length >= response.total) {
        break;
      }
      page++;
    }
    const recent = collected.filter((item) => item.publish_date >= cutoff);
    const inserted = await saveReports(symbol, recent, cutoff);
    const observedAt = new Date();
    await db
      .insert(syncCursor)
      .values({
        source: RESEARCH_METADATA_SYNC_SOURCE,
        endpoint: RESEARCH_METADATA_SYNC_ENDPOINT,
        symbol,
        timeframe: RESEARCH_METADATA_SYNC_TIMEFRAME,
        cursorTime: observedAt,
        updatedAt: observedAt,
      })
      .onConflictDoUpdate({
        target: [syncCursor.source, syncCursor.endpoint, syncCursor.symbol, syncCursor.timeframe],
        set: {
          cursorTime: observedAt,
          updatedAt: observedAt,
        },
      });
    return result(true, inserted, recent.length, observedAt.toISOString());
  } catch (error) {
    return result(false, 0, 0, new Date().toISOString(), error);
  }
}

export async function syncStockAnalystConsensus(
  symbol: string,
  asOfDate = shanghaiDate(),
): Promise<ContentModuleResult> {
  try {
    const items = await quant.analystConsensus(symbol, asOfDate);
    const inserted = await saveAnalystConsensus(symbol, items);
    return result(true, inserted, items.length, new Date().toISOString());
  } catch (error) {
    return result(false, 0, 0, new Date().toISOString(), error);
  }
}

export async function syncStockFinancialSnapshot(symbol: string): Promise<ContentModuleResult> {
  try {
    const items = await quant.financialSnapshot(symbol);
    const inserted = await saveFinancialSnapshots(symbol, items);
    return result(true, inserted, items.length, new Date().toISOString());
  } catch (error) {
    return result(false, 0, 0, new Date().toISOString(), error);
  }
}

export async function syncStockFinancialStatements(symbol: string): Promise<ContentModuleResult> {
  try {
    const items = await quant.financialStatements(symbol);
    const inserted = await saveFinancialSnapshots(symbol, items);
    return result(true, inserted, items.length, new Date().toISOString());
  } catch (error) {
    return result(false, 0, 0, new Date().toISOString(), error);
  }
}

export async function syncStockValuationHistory(
  symbol: string,
  start?: string,
  end?: string,
): Promise<ContentModuleResult> {
  try {
    const items = await quant.valuationHistory(symbol, start, end);
    const inserted = await saveValuationHistory(symbol, items);
    return result(true, inserted, items.length, new Date().toISOString());
  } catch (error) {
    return result(false, 0, 0, new Date().toISOString(), error);
  }
}

function settledResult(settled: PromiseSettledResult<ContentModuleResult>): ContentModuleResult {
  return settled.status === "fulfilled"
    ? settled.value
    : result(false, 0, 0, new Date().toISOString(), settled.reason);
}

export async function syncStockContent(symbol: string): Promise<StockContentResult> {
  const [
    news,
    announcements,
    reports,
    analystConsensus,
    financialSnapshot,
    financialStatements,
    valuationHistory,
  ] = await Promise.allSettled([
    syncStockNews(symbol),
    syncStockAnnouncements(symbol),
    syncStockResearchReports(symbol),
    syncStockAnalystConsensus(symbol),
    syncStockFinancialSnapshot(symbol),
    syncStockFinancialStatements(symbol),
    syncStockValuationHistory(symbol),
  ]);
  return {
    symbol,
    modules: {
      news: settledResult(news),
      announcements: settledResult(announcements),
      reports: settledResult(reports),
      analystConsensus: settledResult(analystConsensus),
      financialSnapshot: settledResult(financialSnapshot),
      financialStatements: settledResult(financialStatements),
      valuationHistory: settledResult(valuationHistory),
    },
  };
}
