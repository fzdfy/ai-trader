import { Hono } from "hono";
import { db } from "../db";
import { syncCursor, jobRun, dataGap } from "../db/schema";
import { desc } from "drizzle-orm";
import { ok } from "../lib/response";

const adminRoute = new Hono();

adminRoute.get("/sync/status", async (c) => {
  const [cursors, recentJobs, unresolvedGaps] = await Promise.all([
    db.select().from(syncCursor),
    db.select().from(jobRun).orderBy(desc(jobRun.startedAt)).limit(50),
    db.select().from(dataGap).limit(100),
  ]);
  return ok(c, { cursors, recentJobs, unresolvedGaps });
});

export { adminRoute };
