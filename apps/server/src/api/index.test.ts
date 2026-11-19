import assert from "node:assert/strict";
import test from "node:test";
import { createDataManagementRoute } from "./data-management.ts";
import { api } from "./index.ts";

test("mounts the latest quote route used by stock analysis", async () => {
  const response = await api.request("/quotes/latest");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: [] });
});

test("protects the data-management API with a server session", async () => {
  const response = await api.request("/data-management/tables");
  assert.equal(response.status, 401);
});

test("removes legacy admin API paths", async () => {
  assert.equal((await api.request("/sync/status")).status, 404);
  assert.equal((await api.request("/data-center/tables")).status, 404);
});

test("data-management route rejects users and allows super administrators", async () => {
  const userRoute = createDataManagementRoute(async () => ({
    id: "u1",
    name: "User",
    email: "user@example.com",
    role: "user",
  }));
  const adminRoute = createDataManagementRoute(async () => ({
    id: "u2",
    name: "Admin",
    email: "admin@example.com",
    role: "super_admin",
  }));

  assert.equal((await userRoute.request("/")).status, 403);
  assert.equal((await adminRoute.request("/")).status, 200);
});

test("normal users cannot trigger audited data-management writes", async () => {
  const userRoute = createDataManagementRoute(async () => ({
    id: "u1",
    name: "User",
    email: "user@example.com",
    role: "user",
  }));

  const response = await userRoute.request("/sync/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "attempt" }),
  });

  assert.equal(response.status, 403);
});

test("module retry requires an explicit reason", async () => {
  const adminRoute = createDataManagementRoute(async () => ({
    id: "u2",
    name: "Admin",
    email: "admin@example.com",
    role: "super_admin",
  }));

  const response = await adminRoute.request("/sync/modules/boards/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
});
