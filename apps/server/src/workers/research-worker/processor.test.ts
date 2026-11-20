import assert from "node:assert/strict";
import test, { after } from "node:test";
import { eq } from "drizzle-orm";

import { db } from "../../db";
import { researchReport, researchReportDocument } from "../../db/schema";
import type { ResearchIndexJob } from "../../services/research-index-contracts";
import { processResearchIndexJob, requeuePendingResearchDocuments } from "./processor.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

after(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

test("metadata jobs sync the report window before preparing indexes", async () => {
  const calls: string[] = [];
  const job: ResearchIndexJob = {
    kind: "metadata",
    symbol: "002594.SZ",
    trigger: "analysis",
  };

  await processResearchIndexJob(job, {
    syncMetadata: async (symbol) => {
      calls.push(`sync:${symbol}`);
      return { ok: true, error: null };
    },
    prepareWindow: async (symbol) => {
      calls.push(`prepare:${symbol}`);
      return { queued: 0, skipped: 0, failed: 0 };
    },
    processReport: async () => {
      throw new Error("unexpected report processing");
    },
  });

  assert.deepEqual(calls, ["sync:002594.SZ", "prepare:002594.SZ"]);
});

test("report jobs process one report and preserve retry failures", async () => {
  const reportJob: ResearchIndexJob = {
    kind: "report",
    reportId: 42,
    symbol: "002594.SZ",
    trigger: "analysis",
  };
  const reportCalls: number[] = [];

  await processResearchIndexJob(reportJob, {
    syncMetadata: async () => {
      throw new Error("unexpected metadata sync");
    },
    prepareWindow: async () => {
      throw new Error("unexpected window preparation");
    },
    processReport: async (reportId) => {
      reportCalls.push(reportId);
    },
  });

  assert.deepEqual(reportCalls, [42]);

  await assert.rejects(
    processResearchIndexJob(reportJob, {
      syncMetadata: async () => ({ ok: true, error: null }),
      prepareWindow: async () => ({ queued: 0, skipped: 0, failed: 0 }),
      processReport: async () => {
        throw new Error("extract failed");
      },
    }),
    /extract failed/,
  );
});

test("metadata sync failures reject the queue job", async () => {
  let prepared = false;

  await assert.rejects(
    processResearchIndexJob(
      { kind: "metadata", symbol: "002594.SZ", trigger: "analysis" },
      {
        syncMetadata: async () => ({ ok: false, error: "upstream unavailable" }),
        prepareWindow: async () => {
          prepared = true;
          return { queued: 0, skipped: 0, failed: 0 };
        },
        processReport: async () => undefined,
      },
    ),
    /upstream unavailable/,
  );

  assert.equal(prepared, false);
});

test(
  "recovery requeues only pending documents older than ten minutes",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `research-recovery-${crypto.randomUUID()}`;
    const symbol = `TEST${crypto.randomUUID().slice(0, 2).toUpperCase()}.SZ`;
    const [staleId, freshId] = await db
      .insert(researchReport)
      .values(
        [1, 2].map((index) => ({
          source,
          sourceId: `${source}-${index}`,
          symbol,
          title: `恢复测试 ${index}`,
          analysts: [],
          publishDate: new Date().toISOString().slice(0, 10),
          pdfUrl: `https://example.com/${source}-${index}.pdf`,
          rawJson: {},
        })),
      )
      .returning({ id: researchReport.id });
    t.after(async () => {
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    await db.insert(researchReportDocument).values([
      {
        reportId: staleId!.id,
        extractStatus: "pending",
        createdAt: new Date(Date.now() - 11 * 60_000),
      },
      {
        reportId: freshId!.id,
        extractStatus: "pending",
        createdAt: new Date(),
      },
    ]);
    const jobs: ResearchIndexJob[] = [];

    await requeuePendingResearchDocuments({
      now: new Date(),
      enqueue: async (job) => {
        jobs.push(job);
        return "job-id";
      },
    });

    assert.ok(jobs.some((job) => job.kind === "report" && job.reportId === staleId!.id));
    assert.ok(jobs.every((job) => job.kind !== "report" || job.reportId !== freshId!.id));
  },
);

test(
  "recovery skips a pending document with an in-flight job",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `research-active-${crypto.randomUUID()}`;
    const symbol = `TEST${crypto.randomUUID().slice(0, 2).toUpperCase()}.SZ`;
    const [report] = await db
      .insert(researchReport)
      .values({
        source,
        sourceId: source,
        symbol,
        title: "活跃索引测试",
        analysts: [],
        publishDate: new Date().toISOString().slice(0, 10),
        pdfUrl: "https://example.com/active.pdf",
        rawJson: {},
      })
      .returning({ id: researchReport.id });
    t.after(async () => {
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    await db.insert(researchReportDocument).values({
      reportId: report!.id,
      extractStatus: "pending",
      createdAt: new Date(Date.now() - 11 * 60_000),
    });
    const jobs: ResearchIndexJob[] = [];

    await requeuePendingResearchDocuments({
      now: new Date(),
      activeReportIds: async () => new Set([report!.id]),
      enqueue: async (job) => {
        jobs.push(job);
        return "job-id";
      },
    });

    assert.ok(jobs.every((job) => job.kind !== "report" || job.reportId !== report!.id));
  },
);
