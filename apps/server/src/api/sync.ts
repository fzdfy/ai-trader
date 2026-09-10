import { Hono } from "hono";
import { db } from "../db";
import { sql, and, eq, isNull, isNotNull, desc, count, lt, gte, lte, inArray } from "drizzle-orm";
import { ok, badRequest } from "../lib/response";
import { jobRun } from "../db/schema";
import { runWithProgress } from "../workers/sync-worker/progress";
import { localDateStr } from "../workers/sync-worker/calendar";
import { boardsPipeRun } from "../workers/sync-worker/pipes/boards";
import { kline1dPipeRun } from "../workers/sync-worker/pipes/kline-1d";
import { klinePeriodPipeRun } from "../workers/sync-worker/pipes/kline-period";

const syncRoute = new Hono();

/**
 * 僵尸任务判定阈值：running 超过 3 小时视为异常（进程崩溃 / 请求断开悬挂），
 * 在查询接口（modules / status / records）与手动触发前自动清理为 failed。
 * 说明：手动同步包含全市场日线（5000+ 标的串行），3 小时足够覆盖正常任务时长。
 */
const STALE_RUN_MS = 3 * 60 * 60 * 1000;

/** 已知同步模块元信息（与 sync-worker cron-config 对齐） */
export const SYNC_MODULES: { jobType: string; name: string }[] = [
  { jobType: "kline-1m", name: "分钟 K 线" },
  { jobType: "kline-1d", name: "日 K 线" },
  { jobType: "gap-detect", name: "缺口检测" },
  { jobType: "news", name: "新闻" },
  { jobType: "boards", name: "板块排行" },
  { jobType: "board-kline", name: "板块指数 K 线" },
  { jobType: "constituents", name: "板块成分股" },
  { jobType: "fundflow", name: "资金流排行" },
  { jobType: "limit-up-pool", name: "涨停池" },
  { jobType: "kline-period", name: "周期 K 线" },
  { jobType: "features", name: "特征计算" },
  { jobType: "sync-manual", name: "手动同步" },
];

/** 与手动同步写同一批行情表、需互斥的 worker 定时任务
 *  （手动同步执行 boards / kline-1d / kline-period，三者都必须互斥，避免并发写冲突） */
const WORKER_MARKET_JOBS = [
  "boards",
  "kline-1d",
  "kline-period",
  "board-kline",
  "constituents",
  "fundflow",
  "limit-up-pool",
  "features",
];

/** 查询最近一次数据更新时间（取 board 表最新 updated_at 作为行情数据新鲜度） */
async function queryLastUpdated(): Promise<string | null> {
  const res = await db.execute(sql`SELECT MAX(updated_at) AS updated_at FROM board`);
  const value = res.rows[0]?.updated_at as Date | string | null | undefined;
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 今日是否已有成功的手动同步（sync-manual）记录（基于本地日期窗口，与 worker 的 hasSuccessToday 对齐） */
async function hasManualSuccessToday(): Promise<boolean> {
  const today = localDateStr();
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${today}T23:59:59.999`);
  const rows = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(
      and(
        eq(jobRun.jobType, "sync-manual"),
        eq(jobRun.status, "success"),
        gte(jobRun.startedAt, start),
        lte(jobRun.startedAt, end),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * 清理僵尸 running 任务：进程崩溃 / 请求断开悬挂导致 status 停在 running，
 * 超过 STALE_RUN_MS 后自动标记为 failed（interrupted），避免界面永远显示「运行中」。
 * 查询类接口统一在开头调用，幂等，返回清理条数。
 */
async function cleanupStaleRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const res = await db
    .update(jobRun)
    .set({ status: "failed", error: "interrupted (stale)", finishedAt: new Date() })
    .where(and(eq(jobRun.status, "running"), isNull(jobRun.finishedAt), lt(jobRun.startedAt, cutoff)));
  return res.rowCount ?? 0;
}

// GET /api/v1/sync/last-updated — 最近数据更新时间
syncRoute.get("/last-updated", async (c) => {
  const updatedAt = await queryLastUpdated();
  return ok(c, { updatedAt });
});

// GET /api/v1/sync/status — 当前运行中的同步任务（跨进程状态，来自 job_run 表）
syncRoute.get("/status", async (c) => {
  await cleanupStaleRuns();
  const rows = await db
    .select({ jobType: jobRun.jobType })
    .from(jobRun)
    .where(and(isNotNull(jobRun.startedAt), isNull(jobRun.finishedAt)));
  return ok(c, { runningJobs: rows.map((r) => r.jobType) });
});

/**
 * GET /api/v1/sync/records?page=1&pageSize=20&jobType=boards&status=running
 *
 * 同步记录分页查询（倒序，最新在前）。
 */
syncRoute.get("/records", async (c) => {
  await cleanupStaleRuns();
  const page = Math.max(Number(c.req.query("page") ?? "1"), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query("pageSize") ?? "20"), 5), 100);
  const jobType = c.req.query("jobType");
  const status = c.req.query("status");

  const conditions = [];
  if (jobType) conditions.push(eq(jobRun.jobType, jobType));
  if (status) conditions.push(eq(jobRun.status, status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const total =
    (await db.select({ value: count() }).from(jobRun).where(where))[0]?.value ?? 0;

  const rows = await db
    .select()
    .from(jobRun)
    .where(where)
    .orderBy(desc(jobRun.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return ok(c, {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      jobType: r.jobType,
      status: r.status,
      total: r.total,
      processed: r.processed,
      message: r.message,
      error: r.error,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs:
        r.startedAt && r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
    })),
  });
});

/**
 * GET /api/v1/sync/modules
 *
 * 每个同步模块的最新状态汇总（含运行中进度），供「同步中心」页展示。
 */
syncRoute.get("/modules", async (c) => {
  await cleanupStaleRuns();
  const rows = await db.select().from(jobRun).orderBy(desc(jobRun.id));

  // 每个模块取最新一条 + 聚合今日统计
  const latestByType = new Map<string, (typeof rows)[number]>();
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = new Map<string, { success: number; failed: number }>();
  let lastSuccessAt: Date | null = null;

  for (const r of rows) {
    if (!latestByType.has(r.jobType)) latestByType.set(r.jobType, r);
    if (r.status === "success" && r.finishedAt) {
      if (lastSuccessAt == null || r.finishedAt > lastSuccessAt) lastSuccessAt = r.finishedAt;
    }
    const started = r.startedAt ? r.startedAt.toISOString().slice(0, 10) : null;
    if (started === today) {
      const s = todayStats.get(r.jobType) ?? { success: 0, failed: 0 };
      if (r.status === "success") s.success++;
      else if (r.status === "failed") s.failed++;
      todayStats.set(r.jobType, s);
    }
  }

  const modules = SYNC_MODULES.map((m) => {
    const latest = latestByType.get(m.jobType);
    const stats = todayStats.get(m.jobType) ?? { success: 0, failed: 0 };
    return {
      jobType: m.jobType,
      name: m.name,
      status: latest?.status ?? "never",
      total: latest?.total ?? null,
      processed: latest?.processed ?? null,
      message: latest?.message ?? null,
      error: latest?.error ?? null,
      startedAt: latest?.startedAt ?? null,
      finishedAt: latest?.finishedAt ?? null,
      lastSuccessAt: latest?.status === "success" ? (latest?.finishedAt ?? null) : null,
      todaySuccess: stats.success,
      todayFailed: stats.failed,
    };
  });

  // 兜底：数据库里出现的未知模块也返回（如脚本手动同步产生的记录）
  for (const jobType of latestByType.keys()) {
    if (SYNC_MODULES.some((m) => m.jobType === jobType)) continue;
    const latest = latestByType.get(jobType)!;
    const stats = todayStats.get(jobType) ?? { success: 0, failed: 0 };
    modules.push({
      jobType,
      name: jobType,
      status: latest.status,
      total: latest.total ?? null,
      processed: latest.processed ?? null,
      message: latest.message ?? null,
      error: latest.error ?? null,
      startedAt: latest.startedAt ?? null,
      finishedAt: latest.finishedAt ?? null,
      lastSuccessAt: latest.status === "success" ? (latest.finishedAt ?? null) : null,
      todaySuccess: stats.success,
      todayFailed: stats.failed,
    });
  }

  return ok(c, { modules, lastSuccessAt });
});

// POST /api/v1/sync/run — 手动触发核心行情同步（板块排行 + 全市场日线 + 周期线）
// 异步触发：请求立即返回，任务在后台执行（避免长任务悬挂 HTTP 连接），
// 前端通过 /sync/modules 轮询看到进度与最终状态。
syncRoute.post("/run", async (c) => {
  await cleanupStaleRuns();

  // 防重入：存在未结束的 sync-manual 任务则拒绝（基于 job_run 状态，跨请求/进程一致）
  const active = await db
    .select({ id: jobRun.id })
    .from(jobRun)
    .where(and(eq(jobRun.jobType, "sync-manual"), eq(jobRun.status, "running"), isNull(jobRun.finishedAt)))
    .limit(1);
  if (active.length > 0) {
    return badRequest(c, "已有同步任务进行中，请稍候");
  }

  // 幂等：今日已成功过则默认拒绝，避免重复全市场拉取；?force=true 可强制重跑
  const force = c.req.query("force") === "true";
  if (!force && (await hasManualSuccessToday())) {
    return badRequest(c, "今日已手动同步成功，如需重跑请加 ?force=true");
  }

  // 与 worker 定时任务互斥：worker 正在跑同一批行情管道时拒绝，避免跨进程并发写
  const workerActive = await db
    .select({ jobType: jobRun.jobType })
    .from(jobRun)
    .where(and(inArray(jobRun.jobType, WORKER_MARKET_JOBS), eq(jobRun.status, "running"), isNull(jobRun.finishedAt)))
    .limit(1);
  if (workerActive.length > 0) {
    return badRequest(c, `行情同步进行中（${workerActive[0]!.jobType}），请稍候`);
  }

  const inserted = await db
    .insert(jobRun)
    .values({ jobType: "sync-manual", status: "running", startedAt: new Date() })
    .returning({ id: jobRun.id });
  const runId = inserted[0]?.id ?? null;

  // 后台执行，不阻塞请求；结束后落终态（success / failed）
  void (async () => {
    try {
      const run = async () => {
        await boardsPipeRun();
        await kline1dPipeRun();
        await klinePeriodPipeRun();
      };
      if (runId != null) {
        await runWithProgress(runId, run);
      } else {
        await run();
      }

      if (runId != null) {
        await db
          .update(jobRun)
          .set({ status: "success", finishedAt: new Date() })
          .where(eq(jobRun.id, runId));
      }
    } catch (error) {
      console.error("[sync] manual sync failed:", error);
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
    }
  })();

  return ok(c, { accepted: true, runId });
});

export { syncRoute };
