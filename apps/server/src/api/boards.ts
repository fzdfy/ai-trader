import { Hono } from "hono";
import { db } from "../db";
import { board } from "../db/schema";
import { eq } from "drizzle-orm";
import { ok } from "../lib/response";

const boardsRoute = new Hono();

// GET /api/v1/boards?type=industry|concept
boardsRoute.get("/", async (c) => {
  const type = c.req.query("type") ?? "industry";

  const rows = await db
    .select()
    .from(board)
    .where(eq(board.type, type))
    .orderBy(board.rank);

  return ok(c, rows);
});

export { boardsRoute };
