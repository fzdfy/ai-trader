import { Hono, type Context } from "hono";
import { count, desc, eq } from "drizzle-orm";
import {
  createRequireSuperAdmin,
  getCurrentUser,
  type AdminEnv,
  type AdminUser,
} from "../lib/admin-access";
import { ok } from "../lib/response";
import { db } from "../db";
import { adminOperationAudit, user } from "../db/schema";
import { reconcileAdminAudits } from "../lib/admin-audit";
import { dataCenterRoute } from "./data-center";
import { syncRoute } from "./sync";
import { governanceRoute } from "./governance";

type ResolveAdminUser = (c: Context) => Promise<AdminUser | null>;

export function createDataManagementRoute(
  resolveUser: ResolveAdminUser = getCurrentUser,
) {
  const route = new Hono<AdminEnv>();
  route.use("*", createRequireSuperAdmin(resolveUser));

  route.get("/", (c) =>
    ok(c, {
      sections: ["sources", "tables", "sync", "quality", "governance", "audit"],
    }),
  );
  route.get("/audit", async (c) => {
    await reconcileAdminAudits();
    const page = Math.max(Number(c.req.query("page") ?? "1"), 1);
    const pageSize = Math.min(
      Math.max(Number(c.req.query("pageSize") ?? "20"), 5),
      100,
    );
    const [total] = await db.select({ value: count() }).from(adminOperationAudit);
    const items = await db
      .select({
        id: adminOperationAudit.id,
        actorUserId: adminOperationAudit.actorUserId,
        actorName: user.name,
        actorEmail: user.email,
        action: adminOperationAudit.action,
        targetJobType: adminOperationAudit.targetJobType,
        reason: adminOperationAudit.reason,
        requestId: adminOperationAudit.requestId,
        jobRunId: adminOperationAudit.jobRunId,
        status: adminOperationAudit.status,
        inputJson: adminOperationAudit.inputJson,
        resultJson: adminOperationAudit.resultJson,
        error: adminOperationAudit.error,
        createdAt: adminOperationAudit.createdAt,
        finishedAt: adminOperationAudit.finishedAt,
      })
      .from(adminOperationAudit)
      .leftJoin(user, eq(adminOperationAudit.actorUserId, user.id))
      .orderBy(desc(adminOperationAudit.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return ok(c, {
      total: Number(total?.value ?? 0),
      page,
      pageSize,
      items,
    });
  });
  route.route("/", dataCenterRoute);
  route.route("/governance", governanceRoute);
  route.route("/sync", syncRoute);

  return route;
}

export const dataManagementRoute = createDataManagementRoute();
