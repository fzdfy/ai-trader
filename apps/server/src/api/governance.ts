import { Hono, type Context } from "hono";
import { and, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  dataIncident,
  dataQualityResult,
  governanceReviewTask,
} from "../db/schema";
import {
  createRequireSuperAdmin,
  getCurrentUser,
  type AdminEnv,
  type AdminUser,
} from "../lib/admin-access";
import { finishAdminAudit, insertAdminAudit } from "../lib/admin-audit";
import {
  getIncident,
  listIncidentEvents,
  transitionIncident,
} from "../lib/data-governance/incidents";
import { QUALITY_RULES } from "../lib/data-governance/quality-rules";
import { GOVERNANCE_ASSETS } from "../lib/data-governance/registry";
import { getSourceStandardReference } from "../lib/data-governance/source-standards";
import {
  getGovernanceReviewTask,
  transitionGovernanceReviewTask,
} from "../lib/data-governance/review-tasks";
import { getLogContext } from "../lib/request-context";
import { badRequest, notFound, ok } from "../lib/response";

type ResolveAdminUser = (c: Context) => Promise<AdminUser | null>;

export function listGovernanceAssets() {
  return GOVERNANCE_ASSETS;
}

export function listQualityRules() {
  return QUALITY_RULES;
}

export async function listQualityResults(
  filter: {
    assetKey?: string;
    status?: string;
    limit?: number;
  } = {},
) {
  const conditions: SQL[] = [];
  if (filter.assetKey) {
    conditions.push(eq(dataQualityResult.assetKey, filter.assetKey));
  }
  if (filter.status) {
    conditions.push(eq(dataQualityResult.status, filter.status));
  }
  return db
    .select()
    .from(dataQualityResult)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(dataQualityResult.checkedAt), desc(dataQualityResult.id))
    .limit(Math.min(Math.max(filter.limit ?? 100, 1), 500));
}

export function listSourceStandards() {
  return [getSourceStandardReference("a-stock-data")];
}

export async function listGovernanceReviewTasks(
  filter: { status?: string; taskType?: string; limit?: number } = {},
) {
  const conditions: SQL[] = [];
  if (filter.status) {
    conditions.push(eq(governanceReviewTask.status, filter.status));
  }
  if (filter.taskType) {
    conditions.push(eq(governanceReviewTask.taskType, filter.taskType));
  }
  return db
    .select()
    .from(governanceReviewTask)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      desc(governanceReviewTask.createdAt),
      desc(governanceReviewTask.id),
    )
    .limit(Math.min(Math.max(filter.limit ?? 100, 1), 500));
}

export async function listIncidents(
  filter: { status?: string; assetKey?: string; limit?: number } = {},
) {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(dataIncident.status, filter.status));
  if (filter.assetKey) {
    conditions.push(eq(dataIncident.assetKey, filter.assetKey));
  }
  return db
    .select()
    .from(dataIncident)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(dataIncident.openedAt), desc(dataIncident.id))
    .limit(Math.min(Math.max(filter.limit ?? 100, 1), 500));
}

function positiveId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function readLimit(value: string | undefined): number {
  const parsed = Number(value ?? "100");
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 1), 500)
    : 100;
}

const actionSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  result: z.record(z.unknown()).optional(),
  rootCause: z.string().trim().max(1000).optional(),
});

async function readAction(c: Context) {
  const parsed = actionSchema.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!parsed.success) return badRequest(c, "操作原因不能为空");
  return parsed.data;
}

async function auditAction(
  c: Context<AdminEnv>,
  input: {
    action:
      | "governance_task_start"
      | "governance_task_complete"
      | "governance_task_cancel"
      | "governance_incident_acknowledge"
      | "governance_incident_resolve";
    reason: string;
    inputJson: Record<string, unknown>;
  },
  run: () => Promise<void>,
) {
  const actor = c.get("currentUser");
  const auditId = await insertAdminAudit({
    actorUserId: actor.id,
    action: input.action,
    reason: input.reason,
    requestId: getLogContext()?.requestId ?? crypto.randomUUID(),
    inputJson: input.inputJson,
  });
  try {
    await run();
    await finishAdminAudit(auditId, { status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishAdminAudit(auditId, { status: "failed", error: message });
    return c.json({ success: false, error: message }, 409);
  }
}

export function createGovernanceRoute(
  resolveUser: ResolveAdminUser = getCurrentUser,
) {
  const route = new Hono<AdminEnv>();
  const requireAdmin = createRequireSuperAdmin(resolveUser);
  route.use("*", async (c, next) => {
    if (c.get("currentUser")) {
      await next();
      return;
    }
    await requireAdmin(c, next);
  });

  route.get("/overview", async (c) => {
    const [assets, qualityResults, tasks, incidents] = await Promise.all([
      Promise.resolve(listGovernanceAssets()),
      listQualityResults({ limit: 12 }),
      listGovernanceReviewTasks({ limit: 12 }),
      listIncidents({ limit: 12 }),
    ]);
    const [activeIncidentCount] = await db
      .select({ value: count() })
      .from(dataIncident)
      .where(
        inArray(dataIncident.status, ["open", "acknowledged", "resolving"]),
      );
    const [pendingTaskCount] = await db
      .select({ value: count() })
      .from(governanceReviewTask)
      .where(eq(governanceReviewTask.status, "pending"));
    return ok(c, {
      counts: {
        assets: assets.length,
        tier0: assets.filter((asset) => asset.tier === "tier_0").length,
        rules: QUALITY_RULES.length,
        activeIncidents: Number(activeIncidentCount?.value ?? 0),
        pendingTasks: Number(pendingTaskCount?.value ?? 0),
      },
      qualityResults,
      workTasks: tasks,
      incidents,
      sourceStandards: listSourceStandards(),
      gateMode: process.env.DATA_GOVERNANCE_GATE_MODE ?? "warn",
    });
  });

  route.get("/assets", (c) =>
    ok(c, { items: listGovernanceAssets() }),
  );
  route.get("/assets/:assetKey", async (c) => {
    const assetKey = c.req.param("assetKey");
    const asset = listGovernanceAssets().find((item) => item.key === assetKey);
    if (!asset) return notFound(c, "数据资产不存在");
    const [qualityResults, incidents, tasks] = await Promise.all([
      listQualityResults({ assetKey, limit: 50 }),
      listIncidents({ assetKey, limit: 20 }),
      db
        .select()
        .from(governanceReviewTask)
        .where(eq(governanceReviewTask.relatedId, assetKey))
        .orderBy(desc(governanceReviewTask.createdAt))
        .limit(20),
    ]);
    return ok(c, { asset, qualityResults, incidents, workTasks: tasks });
  });

  route.get("/quality/rules", (c) =>
    ok(c, { items: listQualityRules() }),
  );
  route.get("/quality/results", async (c) => {
    const items = await listQualityResults({
      assetKey: c.req.query("assetKey") || undefined,
      status: c.req.query("status") || undefined,
      limit: readLimit(c.req.query("limit")),
    });
    return ok(c, { items });
  });

  route.get("/source-standards", async (c) => {
    const sourceStandards = listSourceStandards();
    const items = await Promise.all(
      sourceStandards.map(async (source) => {
        const [latestTask] = await db
          .select()
          .from(governanceReviewTask)
          .where(
            and(
              eq(governanceReviewTask.taskType, "source_standard_review"),
              eq(governanceReviewTask.relatedType, "source_standard"),
            ),
          )
          .orderBy(
            desc(governanceReviewTask.createdAt),
            desc(governanceReviewTask.id),
          )
          .limit(1);
        return { ...source, latestTask: latestTask ?? null };
      }),
    );
    return ok(c, { items, gateMode: process.env.DATA_GOVERNANCE_GATE_MODE ?? "warn" });
  });

  route.get("/review-tasks", async (c) =>
    ok(c, {
      items: await listGovernanceReviewTasks({
        status: c.req.query("status") || undefined,
        taskType: c.req.query("taskType") || undefined,
        limit: readLimit(c.req.query("limit")),
      }),
    }),
  );
  route.get("/review-tasks/:id", async (c) => {
    const id = positiveId(c.req.param("id"));
    if (!id) return badRequest(c, "任务 ID 不正确");
    const task = await getGovernanceReviewTask(id);
    return task ? ok(c, task) : notFound(c, "治理任务不存在");
  });

  for (const action of ["start", "complete", "cancel"] as const) {
    route.post(`/review-tasks/:id/${action}`, async (c) => {
      const id = positiveId(c.req.param("id"));
      if (!id) return badRequest(c, "任务 ID 不正确");
      const body = await readAction(c);
      if (body instanceof Response) return body;
      return auditAction(
        c,
        {
          action: `governance_task_${action}`,
          reason: body.reason,
          inputJson: { taskId: id, reason: body.reason },
        },
        async () => {
          await transitionGovernanceReviewTask(id, {
            action,
            actorUserId: c.get("currentUser").id,
            message: body.reason,
            resultJson:
              action === "complete"
                ? body.result ?? { note: body.reason }
                : undefined,
          });
        },
      ).then((response) => response ?? ok(c, { id, action }));
    });
  }

  route.get("/incidents", async (c) =>
    ok(c, {
      items: await listIncidents({
        status: c.req.query("status") || undefined,
        assetKey: c.req.query("assetKey") || undefined,
        limit: readLimit(c.req.query("limit")),
      }),
    }),
  );
  route.get("/incidents/:id", async (c) => {
    const id = positiveId(c.req.param("id"));
    if (!id) return badRequest(c, "事故 ID 不正确");
    const incident = await getIncident(id);
    if (!incident) return notFound(c, "数据事故不存在");
    return ok(c, {
      incident,
      events: await listIncidentEvents(id),
    });
  });

  for (const [path, action] of [
    ["acknowledge", "acknowledge"],
    ["resolve", "resolve"],
  ] as const) {
    route.post(`/incidents/:id/${path}`, async (c) => {
      const id = positiveId(c.req.param("id"));
      if (!id) return badRequest(c, "事故 ID 不正确");
      const body = await readAction(c);
      if (body instanceof Response) return body;
      return auditAction(
        c,
        {
          action: `governance_incident_${action}`,
          reason: body.reason,
          inputJson: { incidentId: id, reason: body.reason },
        },
        async () => {
          await transitionIncident(id, {
            action,
            actorUserId: c.get("currentUser").id,
            message: body.reason,
            rootCause: body.rootCause ?? null,
          });
        },
      ).then((response) => response ?? ok(c, { id, action }));
    });
  }

  return route;
}

export const governanceRoute = createGovernanceRoute();
