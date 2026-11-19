import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import { workflowDefinition, workflowNodeRun, workflowRun, workflowVersion } from "../db/schema";
import {
  validateWorkflowGraph,
  workflowGraphSchema,
  type WorkflowGraph,
  type WorkflowTriggerConfig,
} from "../lib/workflow-contracts";
import { getSyncTradeDate, isTradeDay, localDateStr } from "../workers/sync-worker/calendar";
import { enqueueWorkflowRun, setWorkflowSchedule } from "./workflow-queue";
import { WorkflowActionError } from "./workflow-action-utils";

type WorkflowDefinition = typeof workflowDefinition.$inferSelect;
type WorkflowVersion = typeof workflowVersion.$inferSelect;
type WorkflowRun = typeof workflowRun.$inferSelect;
type WorkflowTriggerType = "manual" | "schedule" | "sync_complete";

const EMPTY_DRAFT = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
};

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "23505";
}

function normalizeDraftGraph(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((value as { nodes?: unknown }).nodes) ||
    !Array.isArray((value as { edges?: unknown }).edges)
  ) {
    throw new WorkflowActionError("草稿图格式不合法", 400);
  }
  return value as Record<string, unknown>;
}

function parsePublishableGraph(value: unknown): {
  graph: WorkflowGraph;
  trigger: WorkflowTriggerConfig;
} {
  const parsed = workflowGraphSchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkflowActionError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；"),
      400,
    );
  }
  const errors = validateWorkflowGraph(parsed.data);
  if (errors.length > 0) {
    const details = errors.map((error) => `${error.code}: ${error.message}`).join("；");
    throw new WorkflowActionError(details, 400);
  }
  const triggerNode = parsed.data.nodes.find((node) => node.type === "trigger");
  return {
    graph: parsed.data,
    trigger: triggerNode!.config,
  };
}

export async function getOwnedWorkflow(
  workflowId: number,
  userId: string,
  includeArchived = false,
): Promise<WorkflowDefinition> {
  const [workflow] = await db
    .select()
    .from(workflowDefinition)
    .where(
      and(
        eq(workflowDefinition.id, workflowId),
        eq(workflowDefinition.userId, userId),
        includeArchived ? undefined : isNull(workflowDefinition.archivedAt),
      ),
    )
    .limit(1);
  if (!workflow) {
    throw new WorkflowActionError("工作流不存在", 404);
  }
  return workflow;
}

async function getCurrentVersion(workflow: WorkflowDefinition): Promise<WorkflowVersion> {
  if (workflow.currentVersion == null) {
    throw new WorkflowActionError("工作流尚未发布", 409);
  }
  const [version] = await db
    .select()
    .from(workflowVersion)
    .where(
      and(
        eq(workflowVersion.workflowId, workflow.id),
        eq(workflowVersion.version, workflow.currentVersion),
      ),
    )
    .limit(1);
  if (!version) {
    throw new WorkflowActionError("工作流发布版本不存在", 409);
  }
  return version;
}

export async function listWorkflows(userId: string) {
  const workflows = await db
    .select()
    .from(workflowDefinition)
    .where(and(eq(workflowDefinition.userId, userId), isNull(workflowDefinition.archivedAt)))
    .orderBy(desc(workflowDefinition.updatedAt));
  if (workflows.length === 0) return [];

  const runs = await db
    .select()
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.userId, userId),
        inArray(
          workflowRun.workflowId,
          workflows.map((workflow) => workflow.id),
        ),
      ),
    )
    .orderBy(desc(workflowRun.createdAt));
  const latestByWorkflow = new Map<number, WorkflowRun>();
  for (const run of runs) {
    if (!latestByWorkflow.has(run.workflowId)) {
      latestByWorkflow.set(run.workflowId, run);
    }
  }
  const versions = await db
    .select({
      workflowId: workflowVersion.workflowId,
      version: workflowVersion.version,
      triggerType: workflowVersion.triggerType,
      triggerConfig: workflowVersion.triggerConfig,
    })
    .from(workflowVersion)
    .where(
      inArray(
        workflowVersion.workflowId,
        workflows.map((workflow) => workflow.id),
      ),
    )
    .orderBy(desc(workflowVersion.version));
  const versionByWorkflow = new Map<string, (typeof versions)[number]>();
  for (const version of versions) {
    versionByWorkflow.set(`${version.workflowId}:${version.version}`, version);
  }
  return workflows.map((workflow) => ({
    ...workflow,
    latestRun: latestByWorkflow.get(workflow.id) ?? null,
    currentTrigger:
      workflow.currentVersion == null
        ? null
        : (versionByWorkflow.get(`${workflow.id}:${workflow.currentVersion}`) ?? null),
  }));
}

export async function createWorkflow(
  userId: string,
  input: { name?: string; description?: string } = {},
) {
  const [workflow] = await db
    .insert(workflowDefinition)
    .values({
      userId,
      name: input.name?.trim() || "未命名工作流",
      description: input.description?.trim() ?? "",
      draftGraph: EMPTY_DRAFT,
    })
    .returning();
  return workflow!;
}

export async function getWorkflowDetail(workflowId: number, userId: string) {
  const workflow = await getOwnedWorkflow(workflowId, userId);
  let publishedVersion: WorkflowVersion | null = null;
  if (workflow.currentVersion != null) {
    const [version] = await db
      .select()
      .from(workflowVersion)
      .where(
        and(
          eq(workflowVersion.workflowId, workflow.id),
          eq(workflowVersion.version, workflow.currentVersion),
        ),
      )
      .limit(1);
    publishedVersion = version ?? null;
  }
  return {
    ...workflow,
    publishedVersion,
    currentTrigger: publishedVersion
      ? {
          workflowId: publishedVersion.workflowId,
          version: publishedVersion.version,
          triggerType: publishedVersion.triggerType,
          triggerConfig: publishedVersion.triggerConfig,
        }
      : null,
  };
}

export async function saveWorkflowDraft(
  workflowId: number,
  userId: string,
  input: { name?: string; description?: string; draftGraph?: unknown },
) {
  await getOwnedWorkflow(workflowId, userId);
  const [updated] = await db
    .update(workflowDefinition)
    .set({
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.draftGraph !== undefined
        ? { draftGraph: normalizeDraftGraph(input.draftGraph) }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowDefinition.id, workflowId),
        eq(workflowDefinition.userId, userId),
        isNull(workflowDefinition.archivedAt),
      ),
    )
    .returning();
  if (!updated) throw new WorkflowActionError("工作流不存在", 404);
  return updated;
}

export async function publishWorkflow(workflowId: number, userId: string) {
  const published = await db.transaction(async (tx) => {
    const [workflow] = await tx
      .select()
      .from(workflowDefinition)
      .where(
        and(
          eq(workflowDefinition.id, workflowId),
          eq(workflowDefinition.userId, userId),
          isNull(workflowDefinition.archivedAt),
        ),
      )
      .limit(1);
    if (!workflow) throw new WorkflowActionError("工作流不存在", 404);

    const { graph, trigger } = parsePublishableGraph(workflow.draftGraph);
    const [latest] = await tx
      .select({ version: workflowVersion.version })
      .from(workflowVersion)
      .where(eq(workflowVersion.workflowId, workflow.id))
      .orderBy(desc(workflowVersion.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;
    const [version] = await tx
      .insert(workflowVersion)
      .values({
        workflowId: workflow.id,
        version: nextVersion,
        graphJson: graph,
        triggerType: trigger.type,
        triggerConfig: trigger,
      })
      .returning();
    await tx
      .update(workflowDefinition)
      .set({ currentVersion: nextVersion, updatedAt: new Date() })
      .where(and(eq(workflowDefinition.id, workflow.id), eq(workflowDefinition.userId, userId)));
    return {
      workflow: { ...workflow, currentVersion: nextVersion },
      version: version!,
    };
  });

  if (published.workflow.enabled && published.version.triggerType === "schedule") {
    const config = published.version.triggerConfig as {
      type: "schedule";
      time: string;
    };
    await setWorkflowSchedule(workflowId, config.time).catch((error) => {
      console.error("[workflows] update schedule failed", error);
    });
  } else {
    await setWorkflowSchedule(workflowId, null).catch(() => undefined);
  }
  return published.version;
}

export async function setWorkflowEnabled(workflowId: number, userId: string, enabled: boolean) {
  const workflow = await getOwnedWorkflow(workflowId, userId);
  if (!workflow.currentVersion) {
    throw new WorkflowActionError("请先发布工作流再启用", 409);
  }
  const version = await getCurrentVersion(workflow);
  const [updated] = await db
    .update(workflowDefinition)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(workflowDefinition.id, workflowId), eq(workflowDefinition.userId, userId)))
    .returning();

  if (version.triggerType === "schedule") {
    const config = version.triggerConfig as {
      type: "schedule";
      time: string;
    };
    await setWorkflowSchedule(workflowId, enabled ? config.time : null).catch((error) => {
      console.error("[workflows] update schedule failed", error);
    });
  }
  return updated!;
}

export async function archiveWorkflow(workflowId: number, userId: string) {
  await getOwnedWorkflow(workflowId, userId);
  const [updated] = await db
    .update(workflowDefinition)
    .set({
      enabled: false,
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowDefinition.id, workflowId),
        eq(workflowDefinition.userId, userId),
        isNull(workflowDefinition.archivedAt),
      ),
    )
    .returning();
  if (!updated) throw new WorkflowActionError("工作流不存在", 404);
  await setWorkflowSchedule(workflowId, null).catch(() => undefined);
  return updated;
}

interface TriggerResult {
  runId: number;
  skipped: boolean;
  reason?: string;
}

async function createAndQueueRun(
  workflow: WorkflowDefinition,
  version: WorkflowVersion,
  triggerType: WorkflowTriggerType,
  triggerRef: string,
): Promise<TriggerResult> {
  try {
    const [run] = await db
      .insert(workflowRun)
      .values({
        workflowId: workflow.id,
        versionId: version.id,
        userId: workflow.userId,
        status: "pending",
        triggerType,
        triggerRef,
      })
      .returning({ id: workflowRun.id });
    if (!run) throw new WorkflowActionError("运行创建失败", 500);
    try {
      await enqueueWorkflowRun(run.id);
    } catch (error) {
      await db
        .update(workflowRun)
        .set({
          status: "failed",
          error: `队列写入失败：${(error as Error)?.message ?? String(error)}`,
          finishedAt: new Date(),
        })
        .where(eq(workflowRun.id, run.id));
      throw new WorkflowActionError("工作流任务入队失败", 500);
    }
    return { runId: run.id, skipped: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [existing] = await db
      .select({ id: workflowRun.id, status: workflowRun.status })
      .from(workflowRun)
      .where(
        and(
          eq(workflowRun.workflowId, workflow.id),
          eq(workflowRun.triggerType, triggerType),
          eq(workflowRun.triggerRef, triggerRef),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        runId: existing.id,
        skipped: true,
        reason: existing.status === "skipped" ? "duplicate_trigger" : "duplicate_trigger",
      };
    }

    const [active] = await db
      .select({ id: workflowRun.id })
      .from(workflowRun)
      .where(
        and(
          eq(workflowRun.workflowId, workflow.id),
          inArray(workflowRun.status, ["pending", "running"]),
        ),
      )
      .limit(1);
    const [skippedRun] = await db
      .insert(workflowRun)
      .values({
        workflowId: workflow.id,
        versionId: version.id,
        userId: workflow.userId,
        status: "skipped",
        triggerType,
        triggerRef,
        error: active ? "已有活动运行" : "触发重复",
        finishedAt: new Date(),
      })
      .returning({ id: workflowRun.id });
    return {
      runId: skippedRun!.id,
      skipped: true,
      reason: active ? "active_run" : "duplicate_trigger",
    };
  }
}

export async function triggerManualWorkflow(
  workflowId: number,
  userId: string,
): Promise<TriggerResult> {
  const workflow = await getOwnedWorkflow(workflowId, userId);
  const version = await getCurrentVersion(workflow);
  return createAndQueueRun(workflow, version, "manual", `manual:${crypto.randomUUID()}`);
}

export async function triggerScheduledWorkflow(
  workflowId: number,
  now = new Date(),
  expectedTime?: string,
): Promise<TriggerResult> {
  if (!(await isTradeDay(now))) {
    throw new WorkflowActionError("今天不是交易日", 409);
  }
  const [workflow] = await db
    .select()
    .from(workflowDefinition)
    .where(
      and(
        eq(workflowDefinition.id, workflowId),
        eq(workflowDefinition.enabled, true),
        isNull(workflowDefinition.archivedAt),
      ),
    )
    .limit(1);
  if (!workflow) throw new WorkflowActionError("工作流未启用", 409);
  const version = await getCurrentVersion(workflow);
  if (version.triggerType !== "schedule") {
    throw new WorkflowActionError("工作流不是定时触发器", 409);
  }
  const config = version.triggerConfig as {
    type: "schedule";
    time: string;
  };
  if (expectedTime && config.time !== expectedTime) {
    throw new WorkflowActionError("定时配置已变更", 409);
  }
  const triggerRef = `${localDateStr(now)}T${config.time}`;
  return createAndQueueRun(workflow, version, "schedule", triggerRef);
}

export async function triggerSyncCompleteWorkflows(jobType: string): Promise<TriggerResult[]> {
  const tradeDate = await getSyncTradeDate();
  if (!tradeDate) return [];
  const rows = await db
    .select({
      workflow: workflowDefinition,
      version: workflowVersion,
    })
    .from(workflowDefinition)
    .innerJoin(
      workflowVersion,
      and(
        eq(workflowVersion.workflowId, workflowDefinition.id),
        eq(workflowVersion.version, workflowDefinition.currentVersion),
      ),
    )
    .where(
      and(
        eq(workflowDefinition.enabled, true),
        isNull(workflowDefinition.archivedAt),
        eq(workflowVersion.triggerType, "sync_complete"),
      ),
    );

  const results: TriggerResult[] = [];
  for (const row of rows) {
    const config = row.version.triggerConfig as {
      type: "sync_complete";
      jobType: string;
    };
    if (config.jobType !== jobType) continue;
    results.push(
      await createAndQueueRun(
        row.workflow,
        row.version,
        "sync_complete",
        `${jobType}:${tradeDate}`,
      ),
    );
  }
  return results;
}

export async function cancelWorkflowRun(runId: number, userId: string) {
  const [run] = await db
    .select()
    .from(workflowRun)
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.userId, userId)))
    .limit(1);
  if (!run) throw new WorkflowActionError("运行记录不存在", 404);
  if (["success", "failed", "canceled", "skipped"].includes(run.status)) {
    throw new WorkflowActionError("运行已经结束", 409);
  }
  const now = new Date();
  const [updated] = await db
    .update(workflowRun)
    .set({
      cancelRequestedAt: now,
      ...(run.status === "pending" ? { status: "canceled", finishedAt: now } : {}),
    })
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.userId, userId)))
    .returning();
  return updated!;
}

export async function listWorkflowRuns(
  userId: string,
  options: { workflowId?: number; limit?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  if (options.workflowId) {
    await getOwnedWorkflow(options.workflowId, userId, true);
  }
  return db
    .select({
      id: workflowRun.id,
      workflowId: workflowRun.workflowId,
      workflowName: workflowDefinition.name,
      status: workflowRun.status,
      triggerType: workflowRun.triggerType,
      currentNodeId: workflowRun.currentNodeId,
      error: workflowRun.error,
      startedAt: workflowRun.startedAt,
      finishedAt: workflowRun.finishedAt,
      createdAt: workflowRun.createdAt,
      cancelRequestedAt: workflowRun.cancelRequestedAt,
    })
    .from(workflowRun)
    .innerJoin(workflowDefinition, eq(workflowDefinition.id, workflowRun.workflowId))
    .where(
      and(
        eq(workflowRun.userId, userId),
        options.workflowId ? eq(workflowRun.workflowId, options.workflowId) : undefined,
      ),
    )
    .orderBy(desc(workflowRun.createdAt))
    .limit(limit);
}

export async function listTodayWorkflowRuns(userId: string, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return db
    .select({
      id: workflowRun.id,
      workflowId: workflowRun.workflowId,
      workflowName: workflowDefinition.name,
      status: workflowRun.status,
      triggerType: workflowRun.triggerType,
      currentNodeId: workflowRun.currentNodeId,
      error: workflowRun.error,
      startedAt: workflowRun.startedAt,
      finishedAt: workflowRun.finishedAt,
      createdAt: workflowRun.createdAt,
      cancelRequestedAt: workflowRun.cancelRequestedAt,
    })
    .from(workflowRun)
    .innerJoin(workflowDefinition, eq(workflowDefinition.id, workflowRun.workflowId))
    .where(
      and(
        eq(workflowRun.userId, userId),
        gte(workflowRun.createdAt, start),
        lt(workflowRun.createdAt, end),
      ),
    )
    .orderBy(desc(workflowRun.createdAt));
}

export async function getWorkflowRunDetail(runId: number, userId: string) {
  const [run] = await db
    .select({
      run: workflowRun,
      workflowName: workflowDefinition.name,
      workflowDescription: workflowDefinition.description,
      version: workflowVersion.version,
      graph: workflowVersion.graphJson,
    })
    .from(workflowRun)
    .innerJoin(workflowDefinition, eq(workflowDefinition.id, workflowRun.workflowId))
    .innerJoin(workflowVersion, eq(workflowVersion.id, workflowRun.versionId))
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.userId, userId)))
    .limit(1);
  if (!run) throw new WorkflowActionError("运行记录不存在", 404);
  const nodes = await db
    .select()
    .from(workflowNodeRun)
    .where(eq(workflowNodeRun.workflowRunId, runId))
    .orderBy(asc(workflowNodeRun.createdAt));
  return { ...run, nodes };
}
