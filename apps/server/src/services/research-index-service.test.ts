import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db";
import {
  researchReport,
  researchReportChunk,
  researchReportDocument,
} from "../db/schema";
import {
  RESEARCH_CHUNK_VERSION,
  RESEARCH_EMBEDDING_MODEL,
  RESEARCH_EXTRACTOR_VERSION,
} from "./research-index-contracts";
import {
  getResearchIndexStatus,
  prepareResearchIndexWindow,
  processResearchReport,
} from "./research-index-service.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

after(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

async function seedReport(source: string, symbol: string, index: number) {
  const [row] = await db
    .insert(researchReport)
    .values({
      source,
      sourceId: `${source}-${index}`,
      symbol,
      title: `研报 ${index}`,
      analysts: [],
      publishDate: new Date().toISOString().slice(0, 10),
      pdfUrl: `https://example.com/${source}-${index}.pdf`,
      rawJson: {},
    })
    .returning({ id: researchReport.id });
  return row!.id;
}

function vector() {
  return Array.from({ length: 512 }, (_, index) => (index === 0 ? 1 : 0));
}

test(
  "research index status distinguishes missing, pending, failed and current versions",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `research-status-${crypto.randomUUID()}`;
    const symbol = `TEST${crypto.randomUUID().slice(0, 2).toUpperCase()}.SZ`;
    const [missing, pending, failed] = await Promise.all([
      seedReport(source, symbol, 1),
      seedReport(source, symbol, 2),
      seedReport(source, symbol, 3),
    ]);
    t.after(async () => {
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    await db.insert(researchReportDocument).values([
      { reportId: pending!, extractStatus: "pending" },
      { reportId: failed!, extractStatus: "failed", lastError: "ocr failed" },
    ]);

    const status = await getResearchIndexStatus(symbol);

    assert.equal(status.total, 3);
    assert.equal(status.pending, 2);
    assert.equal(status.extracted, 0);
    assert.equal(status.failed, 1);
    assert.equal(status.action, "index_reports");
    assert.ok(missing);
  },
);

test(
  "failed-only reports stay manual and do not trigger automatic indexing",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `research-failed-${crypto.randomUUID()}`;
    const symbol = `TEST${crypto.randomUUID().slice(0, 2).toUpperCase()}.SZ`;
    const reportId = await seedReport(source, symbol, 1);
    t.after(async () => {
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    await db.insert(researchReportDocument).values({
      reportId,
      extractStatus: "failed",
      lastError: "upstream failed",
    });

    const status = await getResearchIndexStatus(symbol);

    assert.deepEqual(
      {
        pending: status.pending,
        extracted: status.extracted,
        failed: status.failed,
        action: status.action,
      },
      { pending: 0, extracted: 0, failed: 1, action: "none" },
    );
  },
);

test(
  "current extracted report is complete while stale versions require reindex",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `research-version-${crypto.randomUUID()}`;
    const symbol = `TEST${crypto.randomUUID().slice(0, 2).toUpperCase()}.SZ`;
    const currentId = await seedReport(source, symbol, 1);
    const staleId = await seedReport(source, symbol, 2);
    t.after(async () => {
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    await db.insert(researchReportDocument).values([
      {
        reportId: currentId,
        extractStatus: "extracted",
        extractorVersion: RESEARCH_EXTRACTOR_VERSION,
      },
      { reportId: staleId, extractStatus: "extracted", extractorVersion: "old" },
    ]);
    await db.insert(researchReportChunk).values([
      {
        reportId: currentId,
        chunkIndex: 0,
        pageFrom: 1,
        pageTo: 1,
        chunkText: "current",
        embedding: vector(),
        embeddingModel: RESEARCH_EMBEDDING_MODEL,
        chunkVersion: RESEARCH_CHUNK_VERSION,
      },
      {
        reportId: staleId,
        chunkIndex: 0,
        pageFrom: 1,
        pageTo: 1,
        chunkText: "stale",
        embedding: vector(),
        embeddingModel: RESEARCH_EMBEDDING_MODEL,
        chunkVersion: "old",
      },
    ]);

    const status = await getResearchIndexStatus(symbol);

    assert.equal(status.extracted, 1);
    assert.equal(status.pending, 1);
    assert.equal(status.action, "index_reports");
  },
);

test(
  "prepare creates pending placeholders and skips current or failed reports",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `research-prepare-${crypto.randomUUID()}`;
    const symbol = `TEST${crypto.randomUUID().slice(0, 2).toUpperCase()}.SZ`;
    const missingId = await seedReport(source, symbol, 1);
    const failedId = await seedReport(source, symbol, 2);
    t.after(async () => {
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    await db.insert(researchReportDocument).values({
      reportId: failedId,
      extractStatus: "failed",
      lastError: "failed",
    });
    const queued: number[] = [];

    const result = await prepareResearchIndexWindow(symbol, 30, async (job) => {
      if (job.kind === "report") queued.push(job.reportId);
      return "job-id";
    });

    assert.deepEqual(queued, [missingId]);
    assert.deepEqual(result, { queued: 1, skipped: 1, failed: 0 });
    const pending = await db
      .select({ reportId: researchReportDocument.reportId })
      .from(researchReportDocument)
      .where(
        and(
          inArray(researchReportDocument.reportId, [missingId, failedId]),
          eq(researchReportDocument.extractStatus, "pending"),
        ),
      );
    assert.deepEqual(pending.map((row) => row.reportId), [missingId]);
  },
);

test(
  "report processing writes current chunks or persists failure",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `research-process-${crypto.randomUUID()}`;
    const symbol = `TEST${crypto.randomUUID().slice(0, 2).toUpperCase()}.SZ`;
    const successId = await seedReport(source, symbol, 1);
    const failureId = await seedReport(source, symbol, 2);
    t.after(async () => {
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    const extraction = {
      storage_key: "eastmoney/test.pdf",
      sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      file_size: 1234,
      extractor_version: RESEARCH_EXTRACTOR_VERSION,
      embedding_model: RESEARCH_EMBEDDING_MODEL,
      page_count: 1,
      full_text: "正文",
      pages: [{ page: 1, text: "正文" }],
      chunks: [
        {
          chunk_index: 0,
          page_from: 1,
          page_to: 1,
          text: "正文",
          embedding: vector(),
        },
      ],
    };

    await processResearchReport(successId, async () => extraction);
    await assert.rejects(
      processResearchReport(failureId, async () => {
        throw new Error("extract failed");
      }),
      /extract failed/,
    );

    const documents = await db
      .select({
        reportId: researchReportDocument.reportId,
        status: researchReportDocument.extractStatus,
        error: researchReportDocument.lastError,
      })
      .from(researchReportDocument)
      .where(inArray(researchReportDocument.reportId, [successId, failureId]));
    assert.deepEqual(
      documents.sort((left, right) => left.reportId - right.reportId),
      [
        { reportId: successId, status: "extracted", error: null },
        { reportId: failureId, status: "failed", error: "extract failed" },
      ],
    );
    const chunks = await db
      .select({ reportId: researchReportChunk.reportId })
      .from(researchReportChunk)
      .where(eq(researchReportChunk.reportId, successId));
    assert.equal(chunks.length, 1);
  },
);
