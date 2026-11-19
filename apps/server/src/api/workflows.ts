import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { created, ok, badRequest } from "../lib/response";
import { requireWorkflowUser } from "../lib/workflow-auth";
import {
  archiveWorkflow,
  cancelWorkflowRun,
  createWorkflow,
  getWorkflowDetail,
  getWorkflowRunDetail,
  listTodayWorkflowRuns,
  listWorkflowRuns,
  listWorkflows,
  publishWorkflow,
  saveWorkflowDraft,
  setWorkflowEnabled,
  triggerManualWorkflow,
} from "../services/workflow-service";
import { WorkflowActionError } from "../services/workflow-action-utils";

const workflowsRoute = new Hono();

workflowsRoute.onError((error, c) => {
  if (error instanceof WorkflowActionError) {
    return c.json({ success: false, error: error.message }, error.status);
  }
  if (error instanceof HTTPException) {
    return c.json({ success: false, error: error.message || "Unauthorized" }, error.status);
  }
  throw error;
});

function positiveId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new WorkflowActionError("id 必须为正整数", 400);
  }
  return id;
}

workflowsRoute.get("/", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  return ok(c, { items: await listWorkflows(user.id) });
});

workflowsRoute.post("/", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
  };
  return created(c, await createWorkflow(user.id, body));
});

workflowsRoute.get("/runs/today", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  return ok(c, { items: await listTodayWorkflowRuns(user.id) });
});

workflowsRoute.get("/runs/:runId", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  return ok(c, await getWorkflowRunDetail(positiveId(c.req.param("runId")), user.id));
});

workflowsRoute.post("/runs/:runId/cancel", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  return ok(c, {
    run: await cancelWorkflowRun(positiveId(c.req.param("runId")), user.id),
  });
});

workflowsRoute.get("/:workflowId/runs", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  const limit = Number(c.req.query("limit"));
  return ok(c, {
    items: await listWorkflowRuns(user.id, {
      workflowId: positiveId(c.req.param("workflowId")),
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  });
});

workflowsRoute.get("/:workflowId", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  return ok(c, await getWorkflowDetail(positiveId(c.req.param("workflowId")), user.id));
});

workflowsRoute.patch("/:workflowId", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    draftGraph?: unknown;
  };
  return ok(c, await saveWorkflowDraft(positiveId(c.req.param("workflowId")), user.id, body));
});

workflowsRoute.post("/:workflowId/publish", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  return ok(c, {
    version: await publishWorkflow(positiveId(c.req.param("workflowId")), user.id),
  });
});

workflowsRoute.post("/:workflowId/enabled", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  const body = (await c.req.json()) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") {
    return badRequest(c, "enabled is required");
  }
  return ok(c, {
    workflow: await setWorkflowEnabled(
      positiveId(c.req.param("workflowId")),
      user.id,
      body.enabled,
    ),
  });
});

workflowsRoute.post("/:workflowId/run", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  return ok(c, await triggerManualWorkflow(positiveId(c.req.param("workflowId")), user.id));
});

workflowsRoute.delete("/:workflowId", async (c) => {
  const user = await requireWorkflowUser(c.req.raw.headers);
  return ok(c, {
    workflow: await archiveWorkflow(positiveId(c.req.param("workflowId")), user.id),
  });
});

export { workflowsRoute };
