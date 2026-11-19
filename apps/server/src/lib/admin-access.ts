import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";

export type AppRole = "user" | "super_admin";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

export type AdminEnv = {
  Variables: {
    currentUser: AdminUser;
  };
};

type ResolveAdminUser = (c: Context) => Promise<AdminUser | null>;

export function isAppRole(value: unknown): value is AppRole {
  return value === "user" || value === "super_admin";
}

export function parseSuperAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function getVerifiedBootstrapAllowlist(
  raw: string | undefined,
  email: string,
  emailVerified: boolean,
): Set<string> {
  const normalized = email.trim().toLowerCase();
  return new Set(
    emailVerified
      ? [...parseSuperAdminEmails(raw)].filter((item) => item === normalized)
      : [],
  );
}

export function resolveEffectiveRole(
  email: string,
  storedRole: unknown,
  allowlist: ReadonlySet<string>,
): AppRole {
  if (allowlist.has(email.trim().toLowerCase())) return "super_admin";
  return isAppRole(storedRole) ? storedRole : "user";
}

export function canAccessDataManagement(role: unknown): boolean {
  return role === "super_admin";
}

export async function getCurrentUser(c: Context): Promise<AdminUser | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;

  const [stored] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  if (!stored) return null;

  const role = resolveEffectiveRole(
    session.user.email,
    stored.role,
    getVerifiedBootstrapAllowlist(
      process.env.SUPER_ADMIN_EMAILS,
      session.user.email,
      Boolean(session.user.emailVerified),
    ),
  );
  if (role !== stored.role) {
    await db
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
  };
}

export function createRequireSuperAdmin(
  resolveUser: ResolveAdminUser = getCurrentUser,
): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    const currentUser = await resolveUser(c);
    if (!currentUser) {
      throw new HTTPException(401, { message: "请先登录" });
    }
    if (!canAccessDataManagement(currentUser.role)) {
      throw new HTTPException(403, { message: "无权访问数据管理" });
    }

    c.set("currentUser", currentUser);
    await next();
  };
}

export function requireSuperAdmin(): MiddlewareHandler<AdminEnv> {
  return createRequireSuperAdmin();
}
