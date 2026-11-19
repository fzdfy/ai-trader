import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { handleHttpError } from "./http-error.ts";

test("preserves HTTP exception status and message", async () => {
  const app = new Hono();
  app.get("/", () => {
    throw new HTTPException(403, { message: "无权访问数据管理" });
  });
  app.onError(handleHttpError);

  const response = await app.request("/");

  assert.equal(response.status, 403);
  assert.equal(await response.text(), "无权访问数据管理");
});
