import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { adminOperationAudit } from "../db/schema";

export type AdminAuditStatus =
  | "running"
  | "success"
  | "failed"
  | "interrupted";

export type AdminAuditInput = {
  actorUserId: string;
  action:
    | "sync_run"
    | "sync_retry"
    | "governance_task_start"
    | "governance_task_complete"
    | "governance_task_cancel"
    | "governance_incident_acknowledge"
    | "governance_incident_resolve";
  targetJobType?: string | null;
  reason?: string | null;
  requestId: string;
  inputJson: unknown;
};

export type AdminAuditResult = {
  status: AdminAuditStatus;
  jobRunId?: number | null;
  resultJson?: unknown;
  error?: string | null;
};

export async function insertAdminAudit(
  input: AdminAuditInput,
): Promise<number> {
  const [row] = await db
    .insert(adminOperationAudit)
    .values({
      actorUserId: input.actorUserId,
      action: input.action,
      targetJobType: input.targetJobType ?? null,
      reason: input.reason ?? null,
      requestId: input.requestId,
      status: "accepted",
      inputJson: input.inputJson,
    })
    .returning({ id: adminOperationAudit.id });

  if (!row) throw new Error("创建操作审计失败");
  return row.id;
}

export async function finishAdminAudit(
  id: number,
  result: AdminAuditResult,
): Promise<void> {
  await db
    .update(adminOperationAudit)
    .set({
      status: result.status,
      ...(result.jobRunId != null ? { jobRunId: result.jobRunId } : {}),
      ...(result.resultJson !== undefined
        ? { resultJson: result.resultJson }
        : {}),
      ...(result.error !== undefined ? { error: result.error } : {}),
      ...(result.status !== "running" ? { finishedAt: new Date() } : {}),
    })
    .where(eq(adminOperationAudit.id, id));
}

export async function reconcileAdminAudits(): Promise<void> {
  await db.execute(sql`
    UPDATE admin_operation_audit AS audit
    SET
      status = job.status,
      result_json = COALESCE(audit.result_json, jsonb_build_object('reconciled', true)),
      error = job.error,
      finished_at = COALESCE(job.finished_at, now())
    FROM job_run AS job
    WHERE audit.job_run_id = job.id
      AND audit.status IN ('accepted', 'running')
      AND job.status IN ('success', 'failed')
  `);
  await db.execute(sql`
    UPDATE admin_operation_audit AS audit
    SET
      status = 'interrupted',
      error = 'interrupted (stale audit)',
      finished_at = now()
    WHERE audit.status IN ('accepted', 'running')
      AND audit.created_at < now() - interval '3 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM job_run AS job
        WHERE job.id = audit.job_run_id
          AND job.status = 'running'
          AND job.finished_at IS NULL
      )
  `);
}
