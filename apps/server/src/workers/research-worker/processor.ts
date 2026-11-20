import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "../../db";
import { researchReport, researchReportDocument } from "../../db/schema";
import type { ResearchIndexJob } from "../../services/research-index-contracts";
import {
  prepareResearchIndexWindow,
  processResearchReport,
  type PrepareIndexResult,
} from "../../services/research-index-service";
import { enqueueResearchIndexJob, RESEARCH_INDEX_QUEUE } from "../../services/research-queue";
import {
  syncStockResearchReports,
  type ContentModuleResult,
} from "../../services/stock-content-service";

type SyncMetadata = (symbol: string) => Promise<Pick<ContentModuleResult, "ok" | "error">>;
type PrepareWindow = (symbol: string) => Promise<PrepareIndexResult>;
type ProcessReport = (reportId: number) => Promise<void>;
type Enqueue = (job: ResearchIndexJob) => Promise<string | null>;
type LoadActiveReportIds = () => Promise<Set<number>>;

export interface ResearchProcessorDependencies {
  syncMetadata: SyncMetadata;
  prepareWindow: PrepareWindow;
  processReport: ProcessReport;
}

const defaultDependencies: ResearchProcessorDependencies = {
  syncMetadata: syncStockResearchReports,
  prepareWindow: (symbol) => prepareResearchIndexWindow(symbol),
  processReport: processResearchReport,
};

export async function processResearchIndexJob(
  job: ResearchIndexJob,
  dependencies: ResearchProcessorDependencies = defaultDependencies,
): Promise<void> {
  if (job.kind === "report") {
    await dependencies.processReport(job.reportId);
    return;
  }

  const metadata = await dependencies.syncMetadata(job.symbol);
  if (!metadata.ok) {
    throw new Error(
      `Research metadata sync failed for ${job.symbol}: ${metadata.error ?? "unknown error"}`,
    );
  }
  const prepared = await dependencies.prepareWindow(job.symbol);
  if (prepared.failed > 0) {
    throw new Error(`Research index preparation failed for ${prepared.failed} report(s)`);
  }
}

export interface ResearchRecoveryDependencies {
  now?: Date;
  staleAfterMs?: number;
  enqueue?: Enqueue;
  activeReportIds?: LoadActiveReportIds;
}

async function loadActiveResearchReportIds(): Promise<Set<number>> {
  const result = await db.execute(sql`
    SELECT DISTINCT (data->>'reportId')::int AS report_id
    FROM pgboss.job
    WHERE name = ${RESEARCH_INDEX_QUEUE}
      AND state IN ('created', 'retry', 'active')
      AND data->>'kind' = 'report'
  `);
  return new Set(
    result.rows
      .map((row) => Number(row.report_id))
      .filter((reportId) => Number.isInteger(reportId)),
  );
}

export async function requeuePendingResearchDocuments(
  dependencies: ResearchRecoveryDependencies = {},
): Promise<number> {
  const now = dependencies.now ?? new Date();
  const staleAfterMs = dependencies.staleAfterMs ?? 10 * 60_000;
  const enqueue = dependencies.enqueue ?? enqueueResearchIndexJob;
  const loadActiveReportIds = dependencies.activeReportIds ?? loadActiveResearchReportIds;
  const rows = await db
    .select({
      reportId: researchReport.id,
      symbol: researchReport.symbol,
    })
    .from(researchReportDocument)
    .innerJoin(researchReport, eq(researchReport.id, researchReportDocument.reportId))
    .where(
      and(
        eq(researchReportDocument.extractStatus, "pending"),
        lt(researchReportDocument.createdAt, new Date(now.getTime() - staleAfterMs)),
      ),
    );
  const activeReportIds = await loadActiveReportIds();

  let requeued = 0;
  for (const row of rows) {
    if (activeReportIds.has(row.reportId)) continue;
    const jobId = await enqueue({
      kind: "report",
      reportId: row.reportId,
      symbol: row.symbol,
      trigger: "recovery",
    });
    if (jobId) requeued++;
  }
  return requeued;
}
