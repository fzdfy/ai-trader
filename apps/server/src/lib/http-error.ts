import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export function handleHttpError(error: Error, c: Context) {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  return c.json({ error: "internal_error", message: "服务器内部错误" }, 500);
}
