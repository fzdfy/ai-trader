import assert from "node:assert/strict";
import test from "node:test";
import { createSystemRoute } from "./system.ts";

test("system features require a server session", async () => {
  const route = createSystemRoute(async () => null, async () => ({
    updatedAt: null,
    availability: "unavailable",
    running: false,
  }));
  assert.equal((await route.request("/features")).status, 401);
});

test("authenticated users receive the dashboard feature flag", async () => {
  const route = createSystemRoute(
    async () => ({
      id: "u1",
      name: "User",
      email: "user@example.com",
      role: "user",
    }),
    async () => ({ updatedAt: null, availability: "unavailable", running: false }),
  () => ({ dashboardMarketRadar: true, marketCenter: false }),
  );
  const response = await route.request("/features");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { dashboardMarketRadar: true, marketCenter: false },
  });
});
