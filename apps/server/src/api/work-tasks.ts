import { Hono, type Context } from "hono";
import { getCurrentUser, type AdminEnv, type AdminUser } from "../lib/admin-access";
import { badRequest, created, notFound, ok, serverError } from "../lib/response";
import {
  workTaskCreateSchema,
  workTaskListQuerySchema,
  workTaskMoveSchema,
  workTaskOrderResetSchema,
  workTaskPatchSchema,
  workTaskSummaryQuerySchema,
  workTaskTransitionSchema,
} from "../lib/work-tasks/contracts";
import {
  WorkTaskNotFoundError,
  WorkTaskStateError,
  createUserWorkTask,
  getUserWorkTask,
  getUserWorkTaskSummary,
  listUserWorkTasks,
  moveUserWorkTask,
  patchUserWorkTask,
  resetUserWorkTaskOrder,
  transitionUserWorkTask,
} from "../lib/work-tasks/service";
import { resolveWorkTaskSource } from "../lib/work-tasks/source-resolver";

type ResolveUser = (c: Context) => Promise<AdminUser | null>;

async function readJson(c: Context): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function positiveId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorResponse(c: Context, error: unknown) {
  if (error instanceof WorkTaskNotFoundError) {
    return notFound(c, error.message);
  }
  if (error instanceof WorkTaskStateError) {
    return c.json({ success: false, error: error.message }, 409);
  }
  console.error("[work-tasks] request failed:", error);
  return serverError(c, "工作任务操作失败");
}

export function createWorkTasksRoute(
  resolveUser: ResolveUser = getCurrentUser,
) {
  const route = new Hono<AdminEnv>();

  route.use("*", async (c, next) => {
    const currentUser = await resolveUser(c);
    if (!currentUser) {
      return c.json({ success: false, error: "请先登录" }, 401);
    }
    c.set("currentUser", currentUser);
    await next();
  });

  route.get("/", async (c) => {
    const parsed = workTaskListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, parsed.error.issues[0]?.message ?? "查询参数不正确");
    }
    try {
      return ok(
        c,
        await listUserWorkTasks({
          ...parsed.data,
          userId: c.get("currentUser").id,
        }),
      );
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.get("/summary", async (c) => {
    const parsed = workTaskSummaryQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, parsed.error.issues[0]?.message ?? "查询参数不正确");
    }
    try {
      return ok(
        c,
        await getUserWorkTaskSummary(
          c.get("currentUser").id,
          parsed.data.localDate,
          parsed.data.timezone,
        ),
      );
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.post("/", async (c) => {
    const parsed = workTaskCreateSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return badRequest(c, parsed.error.issues[0]?.message ?? "任务内容不正确");
    }
    try {
      const userId = c.get("currentUser").id;
      const source =
        parsed.data.sourceType && parsed.data.sourceId
          ? await resolveWorkTaskSource(
              userId,
              parsed.data.sourceType,
              parsed.data.sourceId,
            )
          : null;
      const id = await createUserWorkTask(userId, parsed.data, source);
      return created(c, {
        id,
        sourceResolved:
          Boolean(parsed.data.sourceType) && Boolean(source),
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.post("/order/reset", async (c) => {
    const parsed = workTaskOrderResetSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return badRequest(c, parsed.error.issues[0]?.message ?? "排序参数不正确");
    }
    try {
      await resetUserWorkTaskOrder(
        c.get("currentUser").id,
        parsed.data.status,
      );
      return ok(c, { status: parsed.data.status });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.get("/:id", async (c) => {
    const id = positiveId(c.req.param("id"));
    if (!id) return badRequest(c, "任务 ID 不正确");
    try {
      const task = await getUserWorkTask(c.get("currentUser").id, id);
      return task ? ok(c, task) : notFound(c, "工作任务不存在");
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.patch("/:id", async (c) => {
    const id = positiveId(c.req.param("id"));
    if (!id) return badRequest(c, "任务 ID 不正确");
    const parsed = workTaskPatchSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return badRequest(c, parsed.error.issues[0]?.message ?? "任务内容不正确");
    }
    try {
      await patchUserWorkTask(c.get("currentUser").id, id, parsed.data);
      return ok(c, { id });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.post("/:id/transition", async (c) => {
    const id = positiveId(c.req.param("id"));
    if (!id) return badRequest(c, "任务 ID 不正确");
    const parsed = workTaskTransitionSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return badRequest(c, parsed.error.issues[0]?.message ?? "状态操作不正确");
    }
    try {
      await transitionUserWorkTask(
        c.get("currentUser").id,
        id,
        parsed.data,
      );
      return ok(c, { id, action: parsed.data.action });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  route.post("/:id/move", async (c) => {
    const id = positiveId(c.req.param("id"));
    if (!id) return badRequest(c, "任务 ID 不正确");
    const parsed = workTaskMoveSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return badRequest(c, parsed.error.issues[0]?.message ?? "拖拽参数不正确");
    }
    try {
      await moveUserWorkTask(c.get("currentUser").id, id, parsed.data);
      return ok(c, { id, ...parsed.data });
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  return route;
}

export const workTasksRoute = createWorkTasksRoute();
