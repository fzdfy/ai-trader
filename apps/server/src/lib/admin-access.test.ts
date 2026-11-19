import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import {
  canAccessDataManagement,
  createRequireSuperAdmin,
  getVerifiedBootstrapAllowlist,
  isAppRole,
  parseSuperAdminEmails,
  resolveEffectiveRole,
  type AdminUser,
} from "./admin-access.ts";
import { createSystemRoute } from "../api/system.ts";

test("parses super administrator email allowlists deterministically", () => {
  assert.deepEqual(
    [...parseSuperAdminEmails("A@example.com, b@example.com\n C@example.com ")],
    ["a@example.com", "b@example.com", "c@example.com"],
  );
  assert.deepEqual([...parseSuperAdminEmails(undefined)], []);
});

test("normalizes supported application roles", () => {
  assert.equal(isAppRole("user"), true);
  assert.equal(isAppRole("super_admin"), true);
  assert.equal(isAppRole("admin"), false);
  assert.equal(isAppRole(null), false);
});

test("bootstraps allowlisted emails without silently demoting stored super admins", () => {
  assert.equal(resolveEffectiveRole("user@example.com", null, new Set()), "user");
  assert.equal(
    resolveEffectiveRole("user@example.com", "user", new Set(["user@example.com"])),
    "super_admin",
  );
  assert.equal(
    resolveEffectiveRole("owner@example.com", "super_admin", new Set()),
    "super_admin",
  );
});

test("only super administrators can access data management", () => {
  assert.equal(canAccessDataManagement("super_admin"), true);
  assert.equal(canAccessDataManagement("user"), false);
  assert.equal(canAccessDataManagement(null), false);
});

test("unverified email cannot bootstrap from the super-admin allowlist", () => {
  const raw = "owner@example.com";
  assert.deepEqual(
    [...getVerifiedBootstrapAllowlist(raw, "owner@example.com", false)],
    [],
  );
  assert.deepEqual(
    [...getVerifiedBootstrapAllowlist(raw, "owner@example.com", true)],
    ["owner@example.com"],
  );
});

function guardedApp(user: AdminUser | null) {
  const app = new Hono();
  app.use("*", createRequireSuperAdmin(async () => user));
  app.get("/", (c) => c.json({ allowed: true }));
  return app;
}

test("admin middleware rejects missing sessions even with spoofed identity headers", async () => {
  const response = await guardedApp(null).request("/", {
    headers: {
      "X-User-Id": "attacker",
      "X-Role": "super_admin",
    },
  });

  assert.equal(response.status, 401);
});

test("admin middleware rejects normal users and allows super administrators", async () => {
  const user = { id: "u1", name: "User", email: "user@example.com", role: "user" } as const;
  const superAdmin = { ...user, id: "u2", role: "super_admin" } as const;

  assert.equal((await guardedApp(user).request("/")).status, 403);
  assert.equal((await guardedApp(superAdmin).request("/")).status, 200);
});

test("current-user route returns only the server-resolved identity and role", async () => {
  const route = createSystemRoute(async () => ({
    id: "u1",
    name: "Apollo",
    email: "apollo@example.com",
    role: "super_admin",
  }));

  const response = await route.request("/me");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      id: "u1",
      name: "Apollo",
      email: "apollo@example.com",
      role: "super_admin",
    },
  });
});

test("current-user route rejects missing sessions", async () => {
  const route = createSystemRoute(async () => null);
  assert.equal((await route.request("/me")).status, 401);
});

test("public data status contains only aggregate availability", async () => {
  const route = createSystemRoute(
    async () => ({
      id: "u1",
      name: "Apollo",
      email: "apollo@example.com",
      role: "user",
    }),
    async () => ({
      updatedAt: "2026-11-18T00:00:00.000Z",
      availability: "syncing",
      running: true,
    }),
  );

  const response = await route.request("/data-status");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      updatedAt: "2026-11-18T00:00:00.000Z",
      availability: "syncing",
      running: true,
    },
  });
});
