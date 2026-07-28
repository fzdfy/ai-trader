import type { Context } from "hono";

export function ok<T>(c: Context, data: T) {
  return c.json({ success: true, data }, 200);
}

export function created<T>(c: Context, data: T) {
  return c.json({ success: true, data }, 201);
}

export function paginated<T>(c: Context, data: T[], total: number, page: number, limit: number) {
  return c.json({ success: true, data, total, page, limit, totalPages: Math.ceil(total / limit) }, 200);
}

export function notFound(c: Context, message = "Not found") {
  return c.json({ success: false, error: message }, 404);
}

export function badRequest(c: Context, message = "Bad request") {
  return c.json({ success: false, error: message }, 400);
}

export function serverError(c: Context, message = "Internal server error") {
  return c.json({ success: false, error: message }, 500);
}
