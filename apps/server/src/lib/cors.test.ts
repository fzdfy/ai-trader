import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createCorsMiddleware } from "./cors.ts";

const publicOrigin = "https://public.example";

function createTestApp() {
  const app = new Hono();
  app.use(
    "*",
    createCorsMiddleware({
      BETTER_AUTH_URL: publicOrigin,
      AUTH_TRUSTED_ORIGINS: `${publicOrigin},http://localhost:9080`,
    }),
  );
  app.get("/", (c) => c.text("ok"));
  return app;
}

test("allows credentials for a configured trusted origin", async () => {
  const response = await createTestApp().request("/", {
    headers: { Origin: publicOrigin },
  });

  assert.equal(response.headers.get("Access-Control-Allow-Origin"), publicOrigin);
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
});

test("does not reflect an unknown origin", async () => {
  const response = await createTestApp().request("/", {
    headers: { Origin: "https://evil.example" },
  });

  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("allows any localhost loopback port without opening LAN origins", async () => {
  const localhost = await createTestApp().request("/", {
    headers: { Origin: "http://localhost:5173" },
  });
  assert.equal(
    localhost.headers.get("Access-Control-Allow-Origin"),
    "http://localhost:5173",
  );

  const lan = await createTestApp().request("/", {
    headers: { Origin: "http://192.168.1.10:5173" },
  });
  assert.equal(lan.headers.get("Access-Control-Allow-Origin"), null);
});

test("does not fabricate an origin when the request has none", async () => {
  const response = await createTestApp().request("/");

  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});
