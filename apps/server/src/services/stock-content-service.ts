import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";

import { db } from "../db";
import {
  companyAnnouncement,
  instrument,
  newsArticle,
  newsArticleSymbol,
  researchReport,
  researchReportForecast,
  syncCursor,
} from "../db/schema";
import { quant, type AnnouncementItem, type NewsItem } from "../lib/quant";
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

function reportCutoff(): Date {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return cutoff;
}

async function saveReports(
  symbol: string,
  items: Awaited<ReturnType<typeof quant.researchReports>>["items"],
): Promise<number> {
  const cutoff = reportCutoff().toISOString().slice(0, 10);
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

export async function syncStockResearchReports(symbol: string): Promise<ContentModuleResult> {
  try {
    const cutoff = reportCutoff().toISOString().slice(0, 10);
    const collected: Awaited<ReturnType<typeof quant.researchReports>>["items"] = [];
    let page = 1;
    for (;;) {
      const response = await quant.researchReports(symbol, page, 100, cutoff);
      collected.push(...response.items);
      if (response.items.length < 100 || collected.length >= response.total) {
        break;
      }
      page++;
    }
    const recent = collected.filter((item) => item.publish_date >= cutoff);
    const inserted = await saveReports(symbol, recent);
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

function settledResult(settled: PromiseSettledResult<ContentModuleResult>): ContentModuleResult {
  return settled.status === "fulfilled"
    ? settled.value
    : result(false, 0, 0, new Date().toISOString(), settled.reason);
}

export async function syncStockContent(symbol: string): Promise<StockContentResult> {
  const [news, announcements, reports] = await Promise.allSettled([
    syncStockNews(symbol),
    syncStockAnnouncements(symbol),
    syncStockResearchReports(symbol),
  ]);
  return {
    symbol,
    modules: {
      news: settledResult(news),
      announcements: settledResult(announcements),
      reports: settledResult(reports),
    },
  };
}
