import { Hono } from "hono";
import { db } from "../db";
import { sql, and, eq, isNull, isNotNull } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";
import { jobRun } from "../db/schema";
import { boardsPipeRun } from "../workers/sync-worker/pipes/boards";
import { kline1dPipeRun } from "../workers/sync-worker/pipes/kline-1d";
import { klinePeriodPipeRun } from "../workers/sync-worker/pipes/kline-period";

const syncRoute = new Hono();

/** 手动同步防重入锁（同步为耗时重操作，避免并发触发） */
let syncing = false;

/** 查询最近一次数据更新时间（取 board 表最新 updated_at 作为行情数据新鲜度） */
async function queryLastUpdated(): Promise<string | null> {
  const res = await db.execute(sql`SELECT MAX(updated_at) AS updated_at FROM board`);
  const value = res.rows[0]?.updated_at as Date | string | null | undefined;
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// GET /api/v1/sync/last-updated — 最近数据更新时间
syncRoute.get("/last-updated", async (c) => {
  const updatedAt = await queryLastUpdated();
  return ok(c, { updatedAt });
});

// GET /api/v1/sync/status — 当前运行中的同步任务（跨进程状态，来自 job_run 表）
syncRoute.get("/status", async (c) => {
  const rows = await db
    .select({ jobType: jobRun.jobType })
    .from(jobRun)
    .where(and(isNotNull(jobRun.startedAt), isNull(jobRun.finishedAt)));
  return ok(c, { runningJobs: rows.map((r) => r.jobType) });
});

// POST /api/v1/sync/run — 手动触发核心行情同步（板块排行 + 全市场日线 + 周期线）
syncRoute.post("/run", async (c) => {
  if (syncing) return badRequest(c, "同步进行中，请稍候");

  syncing = true;
  let runId: number | null = null;
  try {
    const inserted = await db
      .insert(jobRun)
      .values({ jobType: "sync-manual", status: "running", startedAt: new Date() })
      .returning({ id: jobRun.id });
    runId = inserted[0]?.id ?? null;

    await boardsPipeRun();
    await kline1dPipeRun();
    await klinePeriodPipeRun();

    if (runId != null) {
      await db
        .update(jobRun)
        .set({ status: "success", finishedAt: new Date() })
        .where(eq(jobRun.id, runId));
    }
  } catch (error) {
    if (runId != null) {
      await db
        .update(jobRun)
        .set({
          status: "failed",
          error: (error as Error)?.message ?? "同步失败",
          finishedAt: new Date(),
        })
        .where(eq(jobRun.id, runId));
    }
    return badRequest(c, (error as Error)?.message ?? "同步失败");
  } finally {
    syncing = false;
  }

  const updatedAt = await queryLastUpdated();
  return ok(c, { updatedAt });
});

export { syncRoute };
