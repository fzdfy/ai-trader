import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getCurrentUser, type AdminUser } from "../lib/admin-access";
import {
  loadPublicDataStatus,
  type PublicDataStatus,
} from "../lib/data-status";
import { ok } from "../lib/response";

type ResolveAdminUser = (c: Context) => Promise<AdminUser | null>;
type LoadPublicDataStatus = () => Promise<PublicDataStatus>;

export function createSystemRoute(
  resolveUser: ResolveAdminUser = getCurrentUser,
  loadDataStatus: LoadPublicDataStatus = loadPublicDataStatus,
) {
  const route = new Hono();

  route.get("/me", async (c) => {
    const currentUser = await resolveUser(c);
    if (!currentUser) {
      throw new HTTPException(401, { message: "请先登录" });
    }
    return ok(c, currentUser);
  });

  route.get("/data-status", async (c) => {
    const currentUser = await resolveUser(c);
    if (!currentUser) {
      throw new HTTPException(401, { message: "请先登录" });
    }
    return ok(c, await loadDataStatus());
  });

  return route;
}

export const systemRoute = createSystemRoute();
