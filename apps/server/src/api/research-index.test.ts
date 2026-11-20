import assert from "node:assert/strict";
import test, { after } from "node:test";
import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "../db";
import { researchReport, researchReportChunk, researchReportDocument } from "../db/schema";
import {
  RESEARCH_CHUNK_VERSION,
  RESEARCH_EMBEDDING_MODEL,
  RESEARCH_EXTRACTOR_VERSION,
} from "../services/research-index-contracts";
import {
  getResearchBoss,
  RESEARCH_INDEX_QUEUE,
  stopResearchQueue,
} from "../services/research-queue";
import { api } from "./index.ts";
import { createResearchIndexWindowHandler } from "./research-reports.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

after(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

test("index-window normalizes the symbol and returns 202", async () => {
  const calls: Array<[string, number]> = [];
  const route = new Hono().post(
    "/index-window",
    createResearchIndexWindowHandler(async (symbol, days) => {
      calls.push([symbol, days]);
      return { queued: 2, skipped: 1, failed: 0 };
    }),
  );

  const response = await route.request("/index-window", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "sh600519", days: 30 }),
  });

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { queued: 2, skipped: 1, failed: 0 },
  });
  assert.deepEqual(calls, [["600519.SH", 30]]);
});

test("index-window rejects invalid symbols and unsupported windows", async () => {
  let calls = 0;
  const route = new Hono().post(
    "/index-window",
    createResearchIndexWindowHandler(async () => {
      calls++;
      return { queued: 0, skipped: 0, failed: 0 };
    }),
  );

  const invalidSymbol = await route.request("/index-window", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "AAPL" }),
  });
  const invalidWindow = await route.request("/index-window", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "600519.SH", days: 60 }),
  });

  assert.equal(invalidSymbol.status, 400);
  assert.equal(invalidWindow.status, 400);
  assert.equal(calls, 0);
});

test("index-window is protected by the research report session", async () => {
  const response = await api.request("/research-reports/index-window", {
    method: "POST",
    body: JSON.stringify({ symbol: "600519.SH" }),
  });

  assert.equal(response.status, 401);
});

test(
  "single ingest returns 202 without reindexing an extracted report",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const originalSession = auth.api.getSession;
    const source = `research-ingest-${crypto.randomUUID()}`;
    const symbol = "600519.SH";
    t.after(async () => {
      auth.api.getSession = originalSession;
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    auth.api.getSession = (async () => ({
      user: { id: "research-index-test" },
      session: { id: "research-index-test-session" },
    })) as typeof originalSession;
    const [report] = await db
      .insert(researchReport)
      .values({
        source,
        sourceId: source,
        symbol,
        title: "已完成研报",
        analysts: [],
        publishDate: new Date().toISOString().slice(0, 10),
        pdfUrl: "https://example.com/complete.pdf",
        rawJson: {},
      })
      .returning({ id: researchReport.id });
    await db.insert(researchReportDocument).values({
      reportId: report!.id,
      extractStatus: "extracted",
      extractorVersion: RESEARCH_EXTRACTOR_VERSION,
    });
    await db.insert(researchReportChunk).values({
      reportId: report!.id,
      chunkIndex: 0,
      pageFrom: 1,
      pageTo: 1,
      chunkText: "已完成",
      embedding: Array.from({ length: 512 }, (_, index) => (index === 0 ? 1 : 0)),
      embeddingModel: RESEARCH_EMBEDDING_MODEL,
      chunkVersion: RESEARCH_CHUNK_VERSION,
    });

    const response = await api.request(`/research-reports/${report!.id}/ingest`, {
      method: "POST",
    });

    assert.equal(response.status, 202);
    assert.deepEqual(
      ((await response.json()) as { data: { status: string } }).data.status,
      "already_indexed",
    );
  },
);

test(
  "single ingest queues an incomplete report and returns 202",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const originalSession = auth.api.getSession;
    const source = `research-queue-${crypto.randomUUID()}`;
    let jobId: string | null = null;
    t.after(async () => {
      auth.api.getSession = originalSession;
      await db.delete(researchReport).where(eq(researchReport.source, source));
      if (jobId) {
        const boss = await getResearchBoss();
        await boss.deleteJob(RESEARCH_INDEX_QUEUE, jobId);
      }
      await stopResearchQueue();
    });
    auth.api.getSession = (async () => ({
      user: { id: "research-index-test" },
      session: { id: "research-index-test-session" },
    })) as typeof originalSession;
    const [report] = await db
      .insert(researchReport)
      .values({
        source,
        sourceId: source,
        symbol: "600519.SH",
        title: "待索引研报",
        analysts: [],
        publishDate: new Date().toISOString().slice(0, 10),
        pdfUrl: "https://example.com/pending.pdf",
        rawJson: {},
      })
      .returning({ id: researchReport.id });

    const response = await api.request(`/research-reports/${report!.id}/ingest`, {
      method: "POST",
    });
    const body = (await response.json()) as {
      data: { status: string; jobId: string | null };
    };
    jobId = body.data.jobId;

    assert.equal(response.status, 202);
    assert.equal(body.data.status, "queued");
    assert.ok(jobId);
    const [document] = await db
      .select({
        status: researchReportDocument.extractStatus,
      })
      .from(researchReportDocument)
      .where(eq(researchReportDocument.reportId, report!.id));
    assert.equal(document?.status, "pending");
  },
);
