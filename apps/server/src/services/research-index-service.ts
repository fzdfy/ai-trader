import { and, count, eq, gte, inArray, isNotNull, max, sql } from "drizzle-orm";

import { db } from "../db";
import {
  researchReport,
  researchReportChunk,
  researchReportDocument,
  syncCursor,
} from "../db/schema";
import { quant } from "../lib/quant";
import {
  RESEARCH_CHUNK_VERSION,
  RESEARCH_EMBEDDING_MODEL,
  RESEARCH_EXTRACTOR_VERSION,
  RESEARCH_INDEX_WINDOW_DAYS,
  RESEARCH_METADATA_SYNC_ENDPOINT,
  RESEARCH_METADATA_SYNC_SOURCE,
  RESEARCH_METADATA_SYNC_TIMEFRAME,
  type ResearchIndexJob,
  type ResearchIndexStatus,
} from "./research-index-contracts";
import { enqueueResearchIndexJob } from "./research-queue";

type Enqueue = (job: ResearchIndexJob) => Promise<string | null>;

interface IndexRow {
  reportId: number;
  documentStatus: string | null;
  extractorVersion: string | null;
}

export interface PrepareIndexResult {
  queued: number;
  skipped: number;
  failed: number;
}

function cutoffDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function loadIndexRows(symbol: string, days: number): Promise<IndexRow[]> {
  return db
    .select({
      reportId: researchReport.id,
      documentStatus: researchReportDocument.extractStatus,
      extractorVersion: researchReportDocument.extractorVersion,
    })
    .from(researchReport)
    .leftJoin(researchReportDocument, eq(researchReportDocument.reportId, researchReport.id))
    .where(
      and(
        eq(researchReport.symbol, symbol),
        gte(researchReport.publishDate, cutoffDate(days)),
        isNotNull(researchReport.pdfUrl),
      ),
    );
}

interface ChunkCoverage {
  total: number;
  embedded: number;
}

async function currentChunkCoverage(reportIds: number[]): Promise<Map<number, ChunkCoverage>> {
  if (reportIds.length === 0) return new Map();
  const rows = await db
    .select({
      reportId: researchReportChunk.reportId,
      total: count(),
      embedded: sql<number>`count(*) filter (
        where ${researchReportChunk.embedding} is not null
          and ${researchReportChunk.embeddingModel} = ${RESEARCH_EMBEDDING_MODEL}
      )::int`,
    })
    .from(researchReportChunk)
    .where(
      and(
        inArray(researchReportChunk.reportId, reportIds),
        eq(researchReportChunk.chunkVersion, RESEARCH_CHUNK_VERSION),
      ),
    )
    .groupBy(researchReportChunk.reportId);
  return new Map(
    rows.map((row) => [row.reportId, { total: Number(row.total), embedded: Number(row.embedded) }]),
  );
}

async function metadataObservedAt(symbol: string): Promise<Date | null> {
  const [cursor] = await db
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
  if (cursor) return cursor.cursorTime ?? cursor.updatedAt;

  const [row] = await db
    .select({ latest: max(researchReport.fetchedAt) })
    .from(researchReport)
    .where(eq(researchReport.symbol, symbol));
  const value = row?.latest;
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export async function getResearchIndexStatus(
  symbol: string,
  days = RESEARCH_INDEX_WINDOW_DAYS,
  now = new Date(),
): Promise<ResearchIndexStatus> {
  const [rows, observed] = await Promise.all([
    loadIndexRows(symbol, days),
    metadataObservedAt(symbol),
  ]);
  const currentChunks = await currentChunkCoverage(rows.map((row) => row.reportId));
  let pending = 0;
  let extracted = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.documentStatus === "failed") {
      failed++;
      continue;
    }
    if (
      row.documentStatus === "extracted" &&
      row.extractorVersion === RESEARCH_EXTRACTOR_VERSION &&
      currentChunks.get(row.reportId)?.total === currentChunks.get(row.reportId)?.embedded &&
      (currentChunks.get(row.reportId)?.total ?? 0) > 0
    ) {
      extracted++;
      continue;
    }
    pending++;
  }

  const metadataFresh =
    observed != null &&
    Number.isFinite(observed.getTime()) &&
    now.getTime() - observed.getTime() <= 86_400_000;
  const action = !metadataFresh ? "sync_metadata" : pending > 0 ? "index_reports" : "none";

  return {
    symbol,
    windowDays: days,
    total: rows.length,
    pending,
    extracted,
    failed,
    action,
    observedAt: now.toISOString(),
  };
}

export async function prepareResearchIndexWindow(
  symbol: string,
  days = RESEARCH_INDEX_WINDOW_DAYS,
  enqueue: Enqueue = enqueueResearchIndexJob,
): Promise<PrepareIndexResult> {
  const status = await getResearchIndexStatus(symbol, days);
  if (status.action === "none") {
    return { queued: 0, skipped: status.extracted + status.failed, failed: 0 };
  }
  if (status.action === "sync_metadata") {
    const jobId = await enqueue({
      kind: "metadata",
      symbol,
      trigger: "analysis",
    });
    return {
      queued: jobId ? 1 : 0,
      skipped: jobId ? 0 : 1,
      failed: 0,
    };
  }

  const rows = await loadIndexRows(symbol, days);
  const currentChunks = await currentChunkCoverage(rows.map((row) => row.reportId));
  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const current =
      row.documentStatus === "extracted" &&
      row.extractorVersion === RESEARCH_EXTRACTOR_VERSION &&
      currentChunks.get(row.reportId)?.total === currentChunks.get(row.reportId)?.embedded &&
      (currentChunks.get(row.reportId)?.total ?? 0) > 0;
    if (current || row.documentStatus === "failed") {
      skipped++;
      continue;
    }

    await db
      .insert(researchReportDocument)
      .values({
        reportId: row.reportId,
        extractStatus: "pending",
      })
      .onConflictDoUpdate({
        target: researchReportDocument.reportId,
        set: {
          extractStatus: "pending",
          lastError: null,
        },
      });
    try {
      const jobId = await enqueue({
        kind: "report",
        reportId: row.reportId,
        symbol,
        trigger: "analysis",
      });
      if (jobId) queued++;
      else skipped++;
    } catch {
      failed++;
    }
  }

  return { queued, skipped, failed };
}

type ExtractReport = (params: {
  pdf_url: string;
  source_id: string;
  publish_date: string;
  embed?: boolean;
}) => Promise<Awaited<ReturnType<typeof quant.extractResearchReport>>>;

export async function processResearchReport(
  reportId: number,
  extract: ExtractReport = quant.extractResearchReport,
): Promise<void> {
  const [report] = await db
    .select()
    .from(researchReport)
    .where(eq(researchReport.id, reportId))
    .limit(1);
  if (!report) throw new Error(`Research report ${reportId} not found`);
  if (!report.pdfUrl) throw new Error(`Research report ${reportId} has no PDF`);

  try {
    const extracted = await extract({
      pdf_url: report.pdfUrl,
      source_id: report.sourceId,
      publish_date: report.publishDate,
      embed: true,
    });
    await db.transaction(async (tx) => {
      await tx
        .insert(researchReportDocument)
        .values({
          reportId,
          storageKey: extracted.storage_key,
          sha256: extracted.sha256,
          fileSize: extracted.file_size,
          pageCount: extracted.page_count,
          contentType: "application/pdf",
          fullText: extracted.full_text,
          extractStatus: "extracted",
          extractorVersion: extracted.extractor_version,
          extractedAt: new Date(),
          lastError: null,
        })
        .onConflictDoUpdate({
          target: researchReportDocument.reportId,
          set: {
            storageKey: extracted.storage_key,
            sha256: extracted.sha256,
            fileSize: extracted.file_size,
            pageCount: extracted.page_count,
            contentType: "application/pdf",
            fullText: extracted.full_text,
            extractStatus: "extracted",
            extractorVersion: extracted.extractor_version,
            extractedAt: new Date(),
            lastError: null,
          },
        });
      await tx.delete(researchReportChunk).where(eq(researchReportChunk.reportId, reportId));
      if (extracted.chunks.length > 0) {
        await tx.insert(researchReportChunk).values(
          extracted.chunks.map((chunk) => ({
            reportId,
            chunkIndex: chunk.chunk_index,
            pageFrom: chunk.page_from,
            pageTo: chunk.page_to,
            chunkText: chunk.text,
            embedding: chunk.embedding,
            embeddingModel: extracted.embedding_model,
            chunkVersion: RESEARCH_CHUNK_VERSION,
          })),
        );
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .insert(researchReportDocument)
      .values({
        reportId,
        extractStatus: "failed",
        lastError: message,
      })
      .onConflictDoUpdate({
        target: researchReportDocument.reportId,
        set: {
          extractStatus: "failed",
          lastError: message,
        },
      });
    throw error;
  }
}
