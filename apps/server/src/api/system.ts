import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getCurrentUser, type AdminUser } from "../lib/admin-access";
import {
  loadPublicDataStatus,
  type PublicDataStatus,
} from "../lib/data-status";
import { ok } from "../lib/response";
import { getSystemFeatures, type SystemFeatures } from "../lib/system-features";

type ResolveAdminUser = (c: Context) => Promise<AdminUser | null>;
type LoadPublicDataStatus = () => Promise<PublicDataStatus>;
type LoadSystemFeatures = () => SystemFeatures;

export function createSystemRoute(
  resolveUser: ResolveAdminUser = getCurrentUser,
  loadDataStatus: LoadPublicDataStatus = loadPublicDataStatus,
  loadFeatures: LoadSystemFeatures = getSystemFeatures,
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

  route.get("/features", async (c) => {
    const currentUser = await resolveUser(c);
    if (!currentUser) {
      throw new HTTPException(401, { message: "请先登录" });
    }
    return ok(c, loadFeatures());
  });

  return route;
}

export const systemRoute = createSystemRoute();
